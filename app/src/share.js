// PDF download, image share (WhatsApp) and link share — works in the Android app (Capacitor)
// and in a normal browser.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

const isNative = () => Capacitor.isNativePlatform();

async function snapshot(el) {
  document.body.classList.add('capturing');
  try {
    await document.fonts.ready;
    return await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: 480,
      onclone: (doc) => doc.body.classList.add('capturing'),
    });
  } finally {
    document.body.classList.remove('capturing');
  }
}

async function writeCache(name, base64) {
  const res = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
  return res.uri;
}

/** Share an element as PNG image (user picks WhatsApp in the share sheet). */
export async function shareAsImage(el, { fileName, text, url }) {
  const canvas = await snapshot(el);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  if (isNative()) {
    const uri = await writeCache(`${fileName}.png`, base64);
    await Share.share({ title: text, text: url ? `${text}\n${url}` : text, files: [uri], dialogTitle: 'WhatsApp' });
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text: url ? `${text}\n${url}` : text });
  } else {
    downloadBlob(blob, `${fileName}.png`);
  }
}

/** Build a multi-page A4 PDF from an element. */
export async function downloadPdf(el, { fileName }) {
  const canvas = await snapshot(el);
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgW = pageW - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pageHpx = Math.floor((pageH - margin * 2) * pxPerMm);
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const h = Math.min(pageHpx, canvas.height - y);
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, part.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (!first) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h / pxPerMm);
    first = false;
    y += h;
  }
  const name = `${fileName}.pdf`;
  if (isNative()) {
    const base64 = pdf.output('datauristring').split(',')[1];
    let savedTo = null;
    try {
      await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Documents, recursive: true });
      savedTo = 'Documents';
    } catch (e) {
      console.warn('Documents write failed', e);
    }
    const uri = await writeCache(name, base64);
    await Share.share({ title: name, files: [uri], dialogTitle: 'PDF' });
    return savedTo;
  }
  pdf.save(name);
  return 'Downloads';
}

/** Share a web link (opens WhatsApp chooser). */
export async function shareLink({ text, url }) {
  if (isNative()) {
    await Share.share({ title: text, text, url });
    return;
  }
  if (navigator.share) {
    await navigator.share({ text, url });
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank');
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
