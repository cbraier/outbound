import { Camera, Sparkles, MessageCircle, LayoutGrid, MapPin, CalendarClock, Mic, ShieldCheck, Check, ArrowRight, FileText, Coins } from "lucide-react";

export default function Landing({ onStart }: { onStart: () => void }) {
  const passos = [
    { n: "01", icon: Camera, t: "Fotografe a fachada", d: "Aponte a câmera para o estabelecimento. A foto cria o lead sozinha." },
    { n: "02", icon: Sparkles, t: "A mensagem pronta", d: "O app escreve a abordagem sob medida pro ramo — ou você usa a sua mensagem fixa." },
    { n: "03", icon: MessageCircle, t: "WhatsApp a WhatsApp", d: "Envie com um toque. Sem app de entrega, sem taxa: abordagem direta que vende." },
  ];

  const recursos = [
    { icon: FileText, t: "Propostas com IA", d: "Cole a conversa do WhatsApp: escopo, prazo e PDF profissional com a sua marca em minutos." },
    { icon: LayoutGrid, t: "Funil visual", d: "Lead · Prospect · Negociando · Fechado · Pós-Vendas — arraste e acompanhe." },
    { icon: MapPin, t: "Radar com mapa", d: "Veja os leads ao redor do seu ponto e toque em “Como chegar”." },
    { icon: CalendarClock, t: "Agenda + follow-ups", d: "Follow-up do dia seguinte automático, com lembrete no celular." },
    { icon: Mic, t: "Cadastro por voz", d: "Fale os dados do estabelecimento e o app preenche." },
    { icon: Sparkles, t: "Seu jeito de vender", d: "O app te entrevista e aprende o seu negócio para ofertar melhor." },
    { icon: ShieldCheck, t: "Sua IA, sua escolha", d: "Gemini, ChatGPT, Claude ou DeepSeek — padrão grátis ou a sua chave." },
  ];

  return (
    <div className="min-h-full bg-white text-brand-deep">
      {/* Topo */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-pink to-brand-purple font-black text-white">O</span>
          <span className="text-lg font-extrabold tracking-tight">Outbound Sales</span>
        </div>
        <button onClick={onStart} className="btn-ghost !px-4">Entrar</button>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pb-10 pt-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-pink/30 bg-brand-pink/5 px-4 py-1.5 text-xs font-bold text-brand-magenta">
          <Camera className="h-3.5 w-3.5" /> Prospecção por foto
        </span>
        <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          Fotografe a fachada.
          <br />
          <span className="bg-gradient-to-r from-brand-pink via-brand-magenta to-brand-purple bg-clip-text text-transparent">
            Prospecte em segundos.
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium text-brand-ink/70 sm:text-lg">
          O Outbound Sales é o app de <b>vendas porta a porta e WhatsApp a WhatsApp</b>: tire a foto do estabelecimento,
          o lead é criado e a mensagem sai pronta para abrir a conversa.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onStart} className="btn-primary !px-7 !py-3 !text-base">
            Começar grátis <ArrowRight className="h-4 w-4" />
          </button>
          <a href="#como" className="btn-ghost !px-6 !py-3">Ver como funciona</a>
        </div>
        <p className="mt-4 text-xs font-semibold text-brand-ink/50">200 Doods de boas-vindas · sem assinatura · você só paga pelo que usa</p>
      </section>

      {/* Como funciona */}
      <section id="como" className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Como funciona</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {passos.map((p) => (
            <div key={p.n} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-pink/15 text-brand-pink"><p.icon className="h-5 w-5" /></span>
                <span className="text-sm font-black text-brand-ink/30">{p.n}</span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold">{p.t}</h3>
              <p className="mt-1 text-sm font-medium text-brand-ink/70">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recursos */}
      <section className="bg-gradient-to-b from-brand-pink/5 to-brand-purple/5 py-14">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Tudo para vender no direct</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recursos.map((r) => (
              <div key={r.t} className="card flex items-start gap-4 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-purple/15 text-brand-purple"><r.icon className="h-5 w-5" /></span>
                <div>
                  <h3 className="font-extrabold">{r.t}</h3>
                  <p className="mt-1 text-sm font-medium text-brand-ink/70">{r.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preço */}
      <section className="mx-auto max-w-md px-5 py-14">
        <div className="card overflow-hidden p-0 text-center">
          <div className="bg-gradient-to-br from-brand-pink to-brand-purple px-6 py-8 text-white">
            <p className="text-sm font-bold uppercase tracking-wider text-white/80">Créditos Dood's</p>
            <p className="mt-1 text-5xl font-black">1 Dood<span className="text-lg font-bold"> = R$ 0,01</span></p>
            <p className="mt-2 text-sm font-semibold text-white/85">200 Doods grátis ao criar a conta</p>
          </div>
          <div className="space-y-3 p-6 text-left">
            {["Sem assinatura: você só paga pelo que usar", "Recargas a partir de R$ 10", "Créditos não expiram", "O que não usa IA continua livre", "Seu saldo fica na conta e não expira"].map((t) => (
              <p key={t} className="flex items-start gap-2 text-sm font-medium text-brand-ink/80">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-money" /> {t}
              </p>
            ))}
            <div className="flex items-center justify-center gap-2 rounded-xl bg-brand-purple/10 py-2 text-xs font-bold text-brand-deep">
              <Coins className="h-4 w-4 text-brand-gold" /> Recarregue quando quiser, dentro do app
            </div>
            <button onClick={onStart} className="btn-primary mt-2 w-full">Começar agora</button>
          </div>
        </div>
      </section>

      <footer className="border-t border-brand-pink/10 py-8 text-center text-xs font-semibold text-brand-ink/50">
        <p>© 2026 Zonn Smart Solutions · CNPJ 51.336.711/0001-72</p>
        <p className="mt-1">Outbound Sales · Vendas porta a porta e WhatsApp a WhatsApp</p>
      </footer>
    </div>
  );
}
