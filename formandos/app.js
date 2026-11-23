const $ = id => document.getElementById(id);
const create = (tag, content, className) => {
  const element = document.createElement(tag);
  if (content) element.textContent = content;
  if (className) element.className = className;
  return element;
};
const button = (label, handler, className = 'secondary') => {
  const control = create('button', label, className);
  control.type = 'button';
  control.addEventListener('click', handler);
  return control;
};
const temporary = new Set();
function objectURL(blob) {
  const url = URL.createObjectURL(blob);
  temporary.add(url);
  return url;
}
function clearMedia() {
  for (const url of temporary) URL.revokeObjectURL(url);
  temporary.clear();
}
const report = () => {
  const message = create('p', '', 'message');
  message.setAttribute('role', 'status');
  return message;
};

const albumApi = 'https://abclva.leodition.com.br/api/formandos/turmas/';

async function api(path, code) {
  const response = await fetch(path, {
    credentials: 'omit',
    headers: { Authorization: 'Bearer ' + code }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).erro || 'Não foi possível concluir. Tente novamente.');
  return response;
}

const lightbox = $('lightbox');
lightbox.querySelector('button').onclick = () => lightbox.close();
function photoCard(url, name, downloadable) {
  const card = create('article', '', 'card');
  const photo = create('img');
  photo.src = url;
  photo.alt = name;
  const preview = button('', () => {
    const image = lightbox.querySelector('img');
    image.src = url;
    image.alt = name;
    lightbox.showModal();
  }, 'photo');
  preview.setAttribute('aria-label', 'Ampliar ' + name.toLowerCase());
  preview.append(photo);
  card.append(preview);
  if (downloadable) {
    const link = create('a', 'Baixar foto', 'secondary');
    link.href = url;
    link.download = downloadable;
    card.append(link);
  }
  return card;
}

function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

async function makeZip(files) {
  const local = [];
  const directory = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let directorySize = 0;
  for (const { blob, filename } of files) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = encoder.encode(filename);
    const checksum = crc32(bytes);
    const entry = new Uint8Array(30 + name.length);
    const h = new DataView(entry.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(12, 0x5c21, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, bytes.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    entry.set(name, 30);
    const item = new Uint8Array(46 + name.length);
    const d = new DataView(item.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    item.set(entry.slice(4, 30), 6);
    d.setUint32(42, offset, true);
    item.set(name, 46);
    local.push(entry, blob);
    directory.push(item);
    offset += entry.length + bytes.length;
    directorySize += item.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  return new Blob([...local, ...directory, end], { type: 'application/zip' });
}

const loading = $('loading');
loading.addEventListener('cancel', event => event.preventDefault());

$('accessForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const { turma, code } = Object.fromEntries(new FormData(form));
  const normalized = code.trim().replace(/-/g, '').toLowerCase();
  const message = $('message');
  message.textContent = '';
  if (!/^[a-f\d]{32}$/.test(normalized)) {
    message.textContent = 'Confira o código de acesso enviado pela Leodition.';
    return;
  }
  const submit = form.querySelector('button');
  submit.disabled = true;
  loading.showModal();
  const delay = new Promise(resolve => setTimeout(resolve, 4000));
  try {
    const path = albumApi + turma;
    const album = await (await api(path, normalized)).json();
    const files = await Promise.all(album.photos.map(async ({ slot, extension }) => ({
      slot,
      filename: 'foto-' + slot + '.' + extension,
      blob: await (await api(path + '/foto/' + slot, normalized)).blob()
    })));
    await delay;
    showAlbum(album, files);
    form.reset();
  } catch (error) {
    await delay;
    message.textContent = error.message;
  } finally {
    loading.close();
    if (!$('gallery').hidden) $('gallery').querySelector('h2').focus();
    submit.disabled = false;
  }
};

function showAlbum(album, files) {
  const gallery = $('gallery');
  const heading = create('h2', album.nome);
  heading.tabIndex = -1;
  const status = report();
  const zip = button('Baixar todas em ZIP', async () => {
    zip.disabled = true;
    try {
      const link = create('a');
      link.href = objectURL(await makeZip(files));
      link.download = 'formandos-2026-turma-' + album.turma + '.zip';
      link.click();
    } catch {
      status.textContent = 'Não foi possível preparar o ZIP. Tente novamente.';
    } finally {
      zip.disabled = false;
    }
  }, 'primary');
  const toolbar = create('div', '', 'toolbar');
  toolbar.append(zip, button('Voltar ao início', () => {
    clearMedia();
    gallery.replaceChildren();
    gallery.hidden = true;
    $('home').hidden = false;
    $('code').focus();
  }));
  const cards = create('div', '', 'cards');
  cards.append(...files.map(file => photoCard(objectURL(file.blob), 'Foto ' + file.slot, file.filename)));
  gallery.replaceChildren(create('p', 'TURMA ' + album.turma, 'overline'), heading, toolbar, status, cards);
  $('home').hidden = true;
  gallery.hidden = false;
}
