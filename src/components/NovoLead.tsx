import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhotoCapture, { type CapturedLead } from "@/components/PhotoCapture";
import { Mic, Square, PenLine, Camera, Loader2, Plus } from "lucide-react";

const EMPTY = { nome: "", telefone: "", rede_social: "", site: "", endereco: "", categoria: "" };

async function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export default function NovoLead({
  userId,
  onCaptured,
}: {
  userId: string;
  onCaptured: (c: CapturedLead) => void;
}) {
  const [mode, setMode] = useState<"foto" | "audio" | "manual">("foto");
  const [f, setF] = useState(EMPTY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const aplicarExtraido = (ext: Record<string, unknown>) => {
    onCaptured({
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
          const { data, error } = await supabase.functions.invoke("ai-message", {
            body: { audio_base64: b64, audio_mime: blob.type },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          aplicarExtraido((data?.extracted || {}) as Record<string, unknown>);
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

  const salvarManual = () => {
    if (!f.nome.trim()) {
      alert("Informe o nome do estabelecimento.");
      return;
    }
    onCaptured({
      nome: f.nome,
      telefone: f.telefone.replace(/\D/g, "") || undefined,
      rede_social: f.rede_social || undefined,
      site: f.site || undefined,
      endereco: f.endereco || undefined,
      categoria: f.categoria || undefined,
    });
    setF(EMPTY);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex gap-2">
        {([["foto", "Foto", Camera], ["audio", "Áudio", Mic], ["manual", "Manual", PenLine]] as const).map(
          ([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setMode(v as typeof mode)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${
                mode === v ? "bg-gradient-to-r from-brand-pink to-brand-purple text-white" : "border border-brand-purple/20 text-brand-ink/60"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ),
        )}
      </div>

      <div className="card p-5">
        {mode === "foto" && (
          <>
            <h2 className="mb-1 text-base font-extrabold text-brand-deep">Cadastrar por foto</h2>
            <p className="mb-3 text-xs text-brand-ink/60">Tire a foto da fachada (ou escolha da galeria). A IA cria o lead.</p>
            <PhotoCapture userId={userId} onCaptured={onCaptured} />
          </>
        )}

        {mode === "audio" && (
          <>
            <h2 className="mb-1 text-base font-extrabold text-brand-deep">Cadastrar por áudio</h2>
            <p className="mb-4 text-xs text-brand-ink/60">Fale os dados do estabelecimento (nome, telefone, endereço...) que a IA preenche.</p>
            <button
              className={recording ? "btn-ghost w-full" : "btn-primary w-full"}
              onClick={recording ? stopRec : startRec}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {busy ? "Processando..." : recording ? "Parar e enviar" : "Gravar áudio"}
            </button>
          </>
        )}

        {mode === "manual" && (
          <>
            <h2 className="mb-3 text-base font-extrabold text-brand-deep">Cadastro manual</h2>
            <div className="space-y-2">
              <div><span className="label">Nome / estabelecimento</span><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="label">Telefone</span><input className="input" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></div>
                <div><span className="label">Rede social</span><input className="input" value={f.rede_social} onChange={(e) => setF({ ...f, rede_social: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="label">Site</span><input className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} /></div>
                <div><span className="label">Categoria</span><input className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></div>
              </div>
              <div><span className="label">Endereço</span><input className="input" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></div>
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
