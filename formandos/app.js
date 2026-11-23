const $ = id => document.getElementById(id);
const api = 'https://abclva.leodition.com.br/api/formandos';
const lightbox = $('lightbox');
const loading = $('loading');
const gallery = $('gallery');

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function button(label, handler, className = 'secondary') {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

lightbox.querySelector('button').onclick = () => lightbox.close();
loading.addEventListener('cancel', event => event.preventDefault());

async function request(path) {
  const response = await fetch(api + path, { credentials: 'omit', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).erro || 'Não foi possível carregar. Tente novamente.');
  return response;
}

function photoCard(path, label, filename, status) {
  const card = element('article', '', 'card');
  const img = element('img');
  img.alt = label;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = api + path;
  const preview = button('', () => {
    const image = lightbox.querySelector('img');
    image.src = img.src;
    image.alt = label;
    lightbox.showModal();
  }, 'photo');
  preview.setAttribute('aria-label', 'Ampliar ' + label);
  preview.append(img);
  const download = button('Baixar foto', async () => {
    download.disabled = true;
    status.textContent = '';
    try {
      const url = URL.createObjectURL(await (await request(path)).blob());
      const link = element('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      status.textContent = error.message || 'Não foi possível baixar a foto.';
    } finally {
      download.disabled = false;
    }
  });
  card.append(preview, download);
  return card;
}

function showGallery(turma, result, trigger) {
  const extras = !turma;
  const path = extras ? '/extras' : '/galerias/' + turma;
  const heading = element('h2', extras ? 'Galeria extra' : 'Turma ' + turma);
  heading.tabIndex = -1;
  const message = element('p', '', 'message');
  message.setAttribute('role', 'status');
  const toolbar = element('div', '', 'toolbar');
  if (!extras) {
    if (result.photos.length) {
      const zip = element('a', 'Baixar ZIP da turma', 'primary');
      zip.href = api + path + '/zip';
      toolbar.append(zip);
    } else {
      const unavailable = button('Baixar ZIP da turma', () => {}, 'primary');
      unavailable.disabled = true;
      toolbar.append(unavailable);
    }
  }
  toolbar.append(button('Voltar às turmas', () => {
    gallery.hidden = true;
    gallery.replaceChildren();
    $('home').hidden = false;
    trigger.focus();
  }));
  const caption = extras
    ? 'Outros registros da formatura, reunidos em uma só galeria.'
    : result.total + ' alunos na lista oficial.';
  gallery.replaceChildren(heading, element('p', caption), toolbar, message);
  if (!result.photos.length) {
    gallery.append(element('p', 'As fotos aparecem aqui assim que forem publicadas.'));
  } else if (extras) {
    const grid = element('div', '', 'cards');
    result.photos.forEach(({ id, extension }, index) => {
      grid.append(photoCard(path + '/' + id, 'Foto extra ' + (index + 1), 'formandos-extra-' + id + '.' + extension, message));
    });
    gallery.append(grid);
  } else {
    const groups = new Map();
    for (const photo of result.photos) {
      if (!groups.has(photo.aluno)) groups.set(photo.aluno, []);
      groups.get(photo.aluno).push(photo);
    }
    for (const group of groups.values()) {
      const section = element('section', '', 'student-group');
      const grid = element('div', '', 'cards');
      section.append(element('h3', group[0].nome), grid);
      for (const { nome, aluno, slot, extension } of group) {
        grid.append(photoCard(path + '/foto/' + encodeURIComponent(aluno) + '/' + slot,
          'Foto ' + slot + ' · ' + nome, 'formandos-' + turma + '-' + aluno + '-' + slot + '.' + extension, message));
      }
      gallery.append(section);
    }
  }
  $('home').hidden = true;
  gallery.hidden = false;
}

async function openGallery(turma, trigger) {
  const status = $('message');
  status.textContent = '';
  trigger.disabled = true;
  loading.showModal();
  try {
    const path = turma ? '/galerias/' + turma : '/extras';
    showGallery(turma, await (await request(path)).json(), trigger);
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'O portal demorou para responder. Tente novamente.' : error.message;
  } finally {
    loading.close();
    trigger.disabled = false;
    if (!gallery.hidden) gallery.querySelector('h2').focus();
  }
}

$('accessForm').onsubmit = event => {
  event.preventDefault();
  const form = event.currentTarget;
  openGallery(new FormData(form).get('turma'), form.querySelector('button'));
};
$('extrasButton').onclick = event => openGallery(null, event.currentTarget);
