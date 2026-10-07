export function montar(template: string, vars: { estabelecimento?: string; site?: string }): string {
  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const site = (vars.site || "").trim();
  const siteUrl = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : "";
  return (template || "")
    .replace(/\{saudacao\}/g, saudacao)
    .replace(/\{estabelecimento\}/g, (vars.estabelecimento || "").trim() || "seu estabelecimento")
    .replace(/\{site\}/g, siteUrl)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
