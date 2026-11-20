import QRCode from "qrcode";

/** URL canônica da mesa: /r/{slug}/table/{tableId} */
export function tableUrl(siteUrl: string, slug: string, tableId: string) {
  return `${siteUrl.replace(/\/$/, "")}/r/${slug}/table/${tableId}`;
}

/** SVG vetorial (impressão nítida em qualquer tamanho). Correção de erro "M" tolera adesivos gastos. */
export function qrSvg(url: string, dark = "#1C1C1A") {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark, light: "#FFFFFF" } });
}

export function qrPngDataUrl(url: string, size = 1024) {
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: size });
}
