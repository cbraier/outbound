import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { imageUrlToDataUrl } from "@/lib/brand";
import { formatBRLRange } from "@/lib/proposals";
import { PROPOSAL_TYPE_LABELS, type SavedProposal } from "@/lib/proposal-types";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "#A855F7").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [168, 85, 247];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tint(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as [number, number, number];
}

function darken(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c * (1 - amount))) as [number, number, number];
}

function imageFormat(dataUrl: string): string {
  const m = /^data:image\/([a-zA-Z0-9+.-]+)/.exec(dataUrl);
  const f = (m?.[1] || "png").toLowerCase();
  return f === "jpeg" || f === "jpg" ? "JPEG" : f === "webp" ? "WEBP" : "PNG";
}

function siteLabel(site: string): string {
  return (site || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function clean(text: string): string {
  return (text || "").replace(/\r/g, "").replace(/\u0000/g, "").trim();
}

function drawFooter(doc: jsPDF, proposal: SavedProposal, page: number, total: number, color: [number, number, number]) {
  const m = proposal.marca;
  const y = PAGE_H - 12;
  doc.setDrawColor(225, 220, 235);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y - 5, PAGE_W - MARGIN, y - 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 135);
  const left = [m.empresa || m.nome, siteLabel(m.site)].filter(Boolean).join("  |  ");
  doc.text(left || "Proposta comercial", MARGIN, y);
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.text(`${page} / ${total}`, PAGE_W - MARGIN, y, { align: "right" });
}

function runningHeader(doc: jsPDF, proposal: SavedProposal, color: [number, number, number], subtitle: string) {
  const m = proposal.marca;
  doc.setFillColor(...color);
  doc.rect(0, 0, PAGE_W, 13, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(m.empresa || m.nome || "Proposta", MARGIN, 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, PAGE_W - MARGIN, 8, { align: "right" });
}

export async function generateProposalPdf(proposal: SavedProposal): Promise<{ blob: Blob; doc: jsPDF }> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const color = hexToRgb(proposal.marca.cor);
  const light = tint(color, 0.9);
  const lighter = tint(color, 0.96);
  const deep = darken(color, 0.45);
  const darkInk: [number, number, number] = [48, 35, 68];
  const logo = proposal.marca.logo_url ? await imageUrlToDataUrl(proposal.marca.logo_url) : null;

  let y = 0;
  const ensure = (space: number) => {
    if (y + space > PAGE_H - 20) {
      doc.addPage();
      runningHeader(doc, proposal, color, "Proposta comercial");
      y = 22;
    }
  };
  const sectionTitle = (title: string) => {
    ensure(18);
    doc.setFillColor(...color);
    doc.rect(MARGIN, y, 2.2, 7, "F");
    doc.setTextColor(...deep);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, MARGIN + 5, y + 5.2);
    y += 11;
  };
  const paragraph = (value: string, size = 10, lineHeight = 4.7, colorInk = darkInk) => {
    const t = clean(value);
    if (!t) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...colorInk);
    const lines = doc.splitTextToSize(t, CONTENT_W);
    for (const line of lines) {
      ensure(lineHeight + 2);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
  };
  const bullets = (items: string[], size = 9.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...darkInk);
    for (const item of items) {
      const lines = doc.splitTextToSize(clean(item), CONTENT_W - 6);
      ensure(5);
      doc.setFillColor(...color);
      doc.circle(MARGIN + 1.4, y - 1.2, 0.9, "F");
      doc.text(lines, MARGIN + 5, y);
      y += Math.max(1, lines.length) * 4.4 + 1.2;
    }
  };
  const label = (value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 120, 145);
    doc.text(value.toUpperCase(), MARGIN, y);
    y += 4;
  };

  doc.setFillColor(...color);
  doc.rect(0, 0, PAGE_W, 66, "F");
  doc.setFillColor(...darken(color, 0.2));
  doc.rect(0, 58, PAGE_W, 8, "F");

  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(MARGIN, 12, 26, 26, 4, 4, "F");
      doc.addImage(logo, imageFormat(logo), MARGIN + 3, 15, 20, 20, undefined, "FAST");
    } catch {
      logoFallback();
    }
  } else {
    logoFallback();
  }

  function logoFallback() {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN, 12, 26, 26, 4, 4, "F");
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    const initial = (proposal.marca.empresa || proposal.marca.nome || "P").slice(0, 1).toUpperCase();
    doc.text(initial, MARGIN + 13, 29, { align: "center" });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text((proposal.marca.empresa || proposal.marca.nome || "Proposta comercial").slice(0, 48), MARGIN + 31, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const contact = [siteLabel(proposal.marca.site), proposal.marca.socials?.instagram ? `@${String(proposal.marca.socials.instagram).split("/").filter(Boolean).pop()}` : ""].filter(Boolean).join("  |  ");
  if (contact) doc.text(contact, MARGIN + 31, 26);
  doc.setFontSize(8);
  doc.text(`Emitida em ${new Date(proposal.created_at).toLocaleDateString("pt-BR")}`, PAGE_W - MARGIN, 20, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("PROPOSTA COMERCIAL", MARGIN, 45);
  doc.setFontSize(21);
  const titleLines = doc.splitTextToSize(clean(proposal.titulo) || "Proposta de projeto digital", CONTENT_W - 30);
  doc.text(titleLines.slice(0, 2), MARGIN, 53);

  y = 76;
  doc.setFillColor(...lighter);
  doc.roundedRect(MARGIN, y, CONTENT_W, 32, 3, 3, "F");
  doc.setDrawColor(...tint(color, 0.7));
  doc.roundedRect(MARGIN, y, CONTENT_W, 32, 3, 3, "S");
  doc.setTextColor(...deep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("PREPARADO PARA", MARGIN + 5, y + 7);
  doc.setFontSize(13);
  doc.text((proposal.cliente.empresa || proposal.cliente.nome || "Cliente").slice(0, 52), MARGIN + 5, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 80, 105);
  const clientLine = [proposal.cliente.nome, proposal.cliente.contato, proposal.cliente.segmento, proposal.cliente.cidade].filter(Boolean).join("  |  ");
  if (clientLine) doc.text(doc.splitTextToSize(clientLine, CONTENT_W - 70), MARGIN + 5, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...deep);
  doc.text("TIPO", PAGE_W - MARGIN - 5, y + 7, { align: "right" });
  doc.text("VALIDADE", PAGE_W - MARGIN - 5, y + 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 80, 105);
  doc.text(PROPOSAL_TYPE_LABELS[proposal.tipo], PAGE_W - MARGIN - 5, y + 11, { align: "right" });
  doc.text(`${proposal.investimento.validade_dias} dias`, PAGE_W - MARGIN - 5, y + 20, { align: "right" });

  y += 41;
  sectionTitle("Resumo da proposta");
  paragraph(proposal.resumo || "Escopo, prazo e investimento estimados a partir da conversa com o cliente.", 10);

  y += 4;
  ensure(30);
  doc.setFillColor(...light);
  doc.roundedRect(MARGIN, y, CONTENT_W, 26, 3, 3, "F");
  doc.setDrawColor(...tint(color, 0.55));
  doc.roundedRect(MARGIN, y, CONTENT_W, 26, 3, 3, "S");
  doc.setTextColor(...deep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("INVESTIMENTO ESTIMADO", MARGIN + 5, y + 7);
  doc.setFontSize(17);
  doc.text(proposal.investimento.texto || formatBRLRange(proposal.investimento.min, proposal.investimento.max) || "A definir", MARGIN + 5, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 80, 105);
  const invNote = [proposal.investimento.observacao, proposal.investimento.forma_pagamento].filter(Boolean).join("  |  ");
  if (invNote) doc.text(doc.splitTextToSize(invNote, CONTENT_W - 10), MARGIN + 5, y + 22);

  y += 35;
  const prazo = proposal.prazo.texto || (proposal.prazo.semanas_min ? `${proposal.prazo.semanas_min} a ${proposal.prazo.semanas_max} semanas` : "");
  if (prazo) {
    sectionTitle("Prazo de entrega");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...deep);
    doc.text(prazo, MARGIN, y + 2);
    y += 10;
  }

  if (proposal.escopo.length) {
    doc.addPage();
    runningHeader(doc, proposal, color, "Escopo do projeto");
    y = 24;
    sectionTitle("Escopo do projeto");
    proposal.escopo.forEach((section, i) => {
      ensure(20);
      doc.setFillColor(...light);
      doc.circle(MARGIN + 3, y + 1.5, 3.2, "F");
      doc.setTextColor(...deep);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(String(i + 1), MARGIN + 3, y + 2.8, { align: "center" });
      doc.setFontSize(11);
      doc.text(clean(section.titulo), MARGIN + 9, y + 2.8);
      y += 8;
      paragraph(section.descricao, 9.5, 4.5);
      if (section.itens.length) bullets(section.itens, 9);
      y += 2;
    });
  }

  if (proposal.entregaveis.length) {
    if (y > 220) {
      doc.addPage();
      runningHeader(doc, proposal, color, "Entregaveis");
      y = 24;
    }
    sectionTitle("O que esta incluído");
    bullets(proposal.entregaveis, 9.5);
    y += 2;
  }

  if (proposal.prazo.etapas.length) {
    if (y > 210) {
      doc.addPage();
      runningHeader(doc, proposal, color, "Cronograma");
      y = 24;
    }
    sectionTitle("Cronograma sugerido");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Etapa", "Duração", "Entregáveis"]],
      body: proposal.prazo.etapas.map((e) => [clean(e.nome), clean(e.duracao), clean(e.entregaveis || "")]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.4, textColor: darkInk },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: lighter },
      theme: "grid",
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY || y) + 10;
  }

  if (proposal.premissas.length || proposal.nao_inclui.length) {
    ensure(30);
    sectionTitle("Premissas e limites");
    if (proposal.premissas.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...deep);
      doc.text("Premissas", MARGIN, y);
      y += 5;
      bullets(proposal.premissas, 9);
    }
    if (proposal.nao_inclui.length) {
      ensure(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...deep);
      doc.text("Não está incluído", MARGIN, y);
      y += 5;
      bullets(proposal.nao_inclui, 9);
    }
  }

  if (proposal.proximos_passos.length) {
    ensure(25);
    sectionTitle("Próximos passos");
    proposal.proximos_passos.forEach((step, i) => {
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...color);
      doc.text(String(i + 1).padStart(2, "0"), MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...darkInk);
      const lines = doc.splitTextToSize(clean(step), CONTENT_W - 12);
      doc.text(lines, MARGIN + 9, y);
      y += Math.max(1, lines.length) * 4.6 + 2;
    });
  }

  if (proposal.mensagem_cliente) {
    ensure(24);
    sectionTitle("Mensagem para o cliente");
    doc.setFillColor(...lighter);
    doc.roundedRect(MARGIN, y, CONTENT_W, 20, 3, 3, "F");
    paragraph(proposal.mensagem_cliente, 9.5, 4.5, deep);
    y += 3;
  }

  ensure(36);
  y = Math.max(y, PAGE_H - 55);
  doc.setDrawColor(...tint(color, 0.5));
  doc.line(MARGIN, y, MARGIN + 75, y);
  doc.setTextColor(...deep);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(proposal.marca.nome || proposal.marca.empresa || "", MARGIN, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 90, 115);
  const signLine = [proposal.marca.empresa, siteLabel(proposal.marca.site)].filter(Boolean).join("  |  ");
  if (signLine) doc.text(signLine, MARGIN, y + 10);
  doc.setFontSize(7.5);
  doc.text(`Proposta válida por ${proposal.investimento.validade_dias} dias.`, PAGE_W - MARGIN, y + 5, { align: "right" });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, proposal, p, total, color);
  }

  return { blob: doc.output("blob"), doc };
}

export async function downloadOrSharePdf(proposal: SavedProposal): Promise<{ blob: Blob; url: string }> {
  const { blob } = await generateProposalPdf(proposal);
  const url = URL.createObjectURL(blob);
  const name = `Proposta-${(proposal.cliente.empresa || proposal.cliente.nome || "cliente").replace(/[^\wÀ-ÿ -]/g, "").trim().replace(/\s+/g, "-")}.pdf`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { blob, url };
}
