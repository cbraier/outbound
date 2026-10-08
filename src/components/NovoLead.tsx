import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCapture, { type CapturedLead } from "@/components/PhotoCapture";
import { maskPhone, phoneDigits, withHttps, maskCep, lookupCep } from "@/lib/format";
import { Mic, Square, PenLine, Camera, ImageUp, Loader2, Plus } from "lucide-react";

const EMPTY = {
  contato: "",
  nome: "",
  telefone: "",
  site: "",
  categoria: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
};

async function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export default function NovoLead({ userId, onCaptured }: { userId: string; onCaptured: (c: CapturedLead) => void | Promise<void> }) {
  const [mode, setMode] = useState<"camera" | "imagem" | "audio" | "manual">("camera");
  const [f, setF] = useState(EMPTY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const aplicarExtraido = async (ext: Record<string, unknown>) => {
    await onCaptured({
      nome: (ext.nome as string) || undefined,
      telefone: ((ext.celular as string) || (ext.telefone as string) || undefined)?.replace(/\D/g, "") || undefined,
      rede_social: (ext.rede_social as string) || undefined,
      site: (ext.site as string) || undefined,
      endereco: (ext.endereco as string) || undefined,
      bairro: (ext.bairro as string) || undefined,
      cidade: (ext.cidade as string) || undefined,
      estado: (ext.estado as string) || undefined,
      cep: (ext.cep as string) || undefined,
      categoria: (ext.categoria as string) || undefined,
      tags: Array.isArray(ext.tags) ? (ext.tags as string[]) : undefined,
    });
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          const b64 = await blobToB64(blob);
          const { data, error } = await supabase.functions.invoke("ai-message", { body: { audio_base64: b64, audio_mime: blob.type } });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          await aplicarExtraido((data?.extracted || {}) as Record<string, unknown>);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Falha no áudio");
        } finally {
          setBusy(false);
        }
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      alert("Não consegui acessar o microfone.");
    }
  };

  const stopRec = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const onCep = async (v: string) => {
    const cep = maskCep(v);
    setF((p) => ({ ...p, cep }));
    if (cep.replace(/\D/g, "").length === 8) {
      const a = await lookupCep(cep);
      if (a) setF((p) => ({ ...p, rua: a.rua || p.rua, bairro: a.bairro || p.bairro, cidade: a.cidade || p.cidade }));
    }
  };

  const salvarManual = async () => {
    if (!f.nome.trim() && !f.contato.trim()) {
      alert("Preencha pelo menos o nome do contato ou do estabelecimento.");
      return;
    }
    const endereco = [f.rua, f.numero, f.bairro, f.cidade].filter(Boolean).join(", ");
    try {
      await onCaptured({
        contato: f.contato || undefined,
        nome: f.nome || f.contato,
        telefone: phoneDigits(f.telefone) || undefined,
        site: withHttps(f.site) || undefined,
        categoria: f.categoria || undefined,
        cep: f.cep || undefined,
        rua: f.rua || undefined,
        numero: f.numero || undefined,
        complemento: f.complemento || undefined,
        bairro: f.bairro || undefined,
        cidade: f.cidade || undefined,
        endereco: endereco || undefined,
      });
      setF(EMPTY);
    } catch (e) {
      alert("Não deu pra salvar o lead: " + (e instanceof Error ? e.message : "erro"));
    }
  };

  const MODES = [
    { v: "camera", label: "Foto", Icon: Camera },
    { v: "imagem", label: "Imagem", Icon: ImageUp },
    { v: "audio", label: "Áudio", Icon: Mic },
    { v: "manual", label: "Manual", Icon: PenLine },
  ] as const;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h2 className="text-center text-lg font-extrabold text-brand-deep">Cadastre seu Lead</h2>

      <div className="flex gap-1.5">
        {MODES.map(({ v, label, Icon }) => (
          <button
            key={v}
            onClick={() => setMode(v)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold ${
              mode === v ? "bg-gradient-to-br from-brand-pink to-brand-purple text-white" : "border border-brand-purple/20 text-brand-ink/60"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {mode === "camera" && (
          <>
            <h3 className="mb-1 text-base font-extrabold text-brand-deep">Foto da fachada</h3>
            <p className="mb-3 text-xs text-brand-ink/60">Tire a foto e o lead é criado automaticamente.</p>
            <PhotoCapture userId={userId} onCaptured={onCaptured} only="camera" />
          </>
        )}

        {mode === "imagem" && (
          <>
            <h3 className="mb-1 text-base font-extrabold text-brand-deep">Escolher da galeria</h3>
            <p className="mb-3 text-xs text-brand-ink/60">Escolha uma foto que você já tirou (mesmo sem internet).</p>
            <PhotoCapture userId={userId} onCaptured={onCaptured} only="file" />
          </>
        )}

        {mode === "audio" && (
          <>
            <h3 className="mb-1 text-base font-extrabold text-brand-deep">Cadastrar por áudio</h3>
            <p className="mb-4 text-xs text-brand-ink/60">Fale os dados do estabelecimento e o cadastro é preenchido.</p>
            <button className={recording ? "btn-ghost w-full" : "btn-primary w-full"} onClick={recording ? stopRec : startRec} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {busy ? "Processando..." : recording ? "Parar e enviar" : "Gravar áudio"}
            </button>
          </>
        )}

        {mode === "manual" && (
          <>
            <h3 className="mb-3 text-base font-extrabold text-brand-deep">Cadastro manual</h3>
            <div className="space-y-2">
              <div><span className="label">Nome do contato</span><input className="input" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} /></div>
              <div><span className="label">Nome do estabelecimento</span><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="label">Telefone</span><input className="input" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: maskPhone(e.target.value) })} placeholder="(48) 99999-9999" /></div>
                <div><span className="label">Categoria</span><input className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></div>
              </div>
              <div><span className="label">Site</span><input className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} onBlur={(e) => setF({ ...f, site: withHttps(e.target.value) })} placeholder="Ex.: meusite.com.br (pode digitar com www ou https://)" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="label">CEP (puxa a rua)</span><input className="input" inputMode="numeric" value={f.cep} onChange={(e) => onCep(e.target.value)} placeholder="00000-000" /></div>
                <div><span className="label">Rua</span><input className="input" value={f.rua} onChange={(e) => setF({ ...f, rua: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><span className="label">Número</span><input className="input" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></div>
                <div className="col-span-2"><span className="label">Complemento</span><input className="input" value={f.complemento} onChange={(e) => setF({ ...f, complemento: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="label">Bairro</span><input className="input" value={f.bairro} onChange={(e) => setF({ ...f, bairro: e.target.value })} /></div>
                <div><span className="label">Cidade</span><input className="input" value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} /></div>
              </div>
            </div>
            <button className="btn-primary mt-3 w-full" onClick={salvarManual}>
              <Plus className="h-4 w-4" /> Salvar lead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
