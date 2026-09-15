import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './react-shell.css';

const LEGACY_ROOT = '/legacy/';
const DEFAULT_PAGE = 'index.html';
const ALLOWED_EXTENSIONS = /\.html?$/i;

function currentPage() {
  const value = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  return value && ALLOWED_EXTENSIONS.test(value) && !value.includes('..') ? value : DEFAULT_PAGE;
}

function messageFor(input) {
  const label = input.dataset.label || input.name || input.placeholder || 'This field';
  if (input.validity.valueMissing) return `${label} is required.`;
  if (input.validity.typeMismatch) return `Please enter a valid ${input.type === 'email' ? 'email address' : 'value'}.`;
  if (input.validity.patternMismatch) return `Please enter a valid ${label.toLowerCase()}.`;
  if (input.validity.rangeUnderflow || input.validity.rangeOverflow) return `Please enter a valid ${label.toLowerCase()} within the allowed range.`;
  if (input.validity.tooShort) return `${label} is too short.`;
  return 'Please check this field.';
}

function prepareForm(form) {
  form.querySelectorAll('input, select, textarea').forEach((input) => {
    const label = input.closest('.field, .modal-field, .form-group, div')?.querySelector('label')?.textContent?.trim() || input.placeholder || input.name || 'This field';
    input.dataset.label = label.replace(/\*/g, '').trim();
    const labelLower = label.toLowerCase();
    if (input.type === 'tel') input.pattern = '[6-9][0-9]{9}';
    if (input.type === 'password') input.minLength = 8;
    if (input.type === 'number') {
      if (labelLower.includes('age')) { input.min = 0; input.max = 130; }
      if (labelLower.includes('stock')) input.min = 0;
      if (labelLower.includes('height')) { input.min = 30; input.max = 300; }
      if (labelLower.includes('weight')) { input.min = 1; input.max = 500; }
    }
    if (input.type === 'date' && labelLower.includes('expiry')) input.min = new Date().toISOString().slice(0, 10);
    if ((/name|diagnosis|symptoms|medicines|patient|test type|date|time/.test(labelLower)) && !/optional|notes|remark|address|reason|instruction/.test(labelLower)) input.required = true;
    input.addEventListener('invalid', () => input.setCustomValidity(messageFor(input)));
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('change', () => input.setCustomValidity(''));
  });
  const password = form.querySelector('input[type="password"]');
  const confirm = [...form.querySelectorAll('input[type="password"]')].find((item) => /confirm/i.test(item.dataset.label));
  if (password && confirm) {
    const match = () => confirm.setCustomValidity(confirm.value && confirm.value !== password.value ? 'Passwords do not match.' : '');
    password.addEventListener('input', match); confirm.addEventListener('input', match);
  }
}

function Toast({ text }) { return text ? <div className="react-toast" role="status">{text}</div> : null; }

function App() {
  const [page, setPage] = useState(currentPage);
  const [markup, setMarkup] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const host = useRef(null);

  const navigate = useCallback((next) => { window.location.hash = next; }, []);
  useEffect(() => { const update = () => setPage(currentPage()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    fetch(`${LEGACY_ROOT}${page}`).then((r) => { if (!r.ok) throw new Error(); return r.text(); }).then((html) => {
      if (!active) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      document.title = doc.title || 'Svasthya';
      const styleNodes = [...doc.querySelectorAll('style')];
      const linkNodes = [...doc.querySelectorAll('link[rel="stylesheet"]')];
      doc.querySelectorAll('script').forEach((node) => node.remove());
      doc.querySelectorAll('[onclick]').forEach((node) => { node.dataset.action = node.getAttribute('onclick'); node.removeAttribute('onclick'); });
      document.querySelectorAll('[data-svasthya-style]').forEach((node) => node.remove());
      styleNodes.forEach((node) => { const style = document.createElement('style'); style.dataset.svasthyaStyle = 'true'; style.textContent = node.textContent; document.head.append(style); });
      linkNodes.forEach((node) => { const link = document.createElement('link'); link.dataset.svasthyaStyle = 'true'; link.rel = 'stylesheet'; link.href = new URL(node.getAttribute('href'), `${window.location.origin}${LEGACY_ROOT}${page}`).href; document.head.append(link); });
      setMarkup(doc.body.innerHTML); setLoading(false);
    }).catch(() => { if (active) { setError('This screen could not be loaded.'); setLoading(false); } });
    return () => { active = false; };
  }, [page]);

  useEffect(() => { if (host.current && markup) host.current.querySelectorAll('form').forEach(prepareForm); }, [markup]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id); }, [toast]);

  const handleClick = (event) => {
    const link = event.target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('#') && !/^(https?:|mailto:|tel:)/.test(href)) {
        const resolved = new URL(href, `${window.location.origin}${LEGACY_ROOT}${page}`);
        if (resolved.pathname.startsWith(LEGACY_ROOT) && ALLOWED_EXTENSIONS.test(resolved.pathname)) { event.preventDefault(); navigate(resolved.pathname.slice(LEGACY_ROOT.length)); return; }
      }
    }
    const button = event.target.closest('button, [onclick]'); if (!button) return;
    const code = button.dataset.action || '';
    const modalId = code.match(/(?:openModal|closeModal)\('([^']+)'\)/)?.[1];
    if (modalId) { event.preventDefault(); const dialog = host.current?.querySelector(`#${CSS.escape(modalId)}`); if (code.includes('openModal')) dialog?.showModal(); else dialog?.close(); return; }
    if (code.includes('.close()')) { event.preventDefault(); button.closest('dialog')?.close(); return; }
    if (code.includes('viewRow') || code.includes('processRow')) {
      event.preventDefault(); const row = button.closest('tr'); const target = host.current?.querySelector(code.includes('processRow') ? '#processModal' : '#viewModal');
      if (code.includes('processRow')) { target?.showModal(); return; }
      if (row && target) { const body = target.querySelector('#viewModalBody'); const title = target.querySelector('#viewModalTitle'); const cells = [...row.querySelectorAll('td[data-label]')]; if (title && cells[0]) title.textContent = cells[0].innerText.trim(); if (body) body.innerHTML = cells.map((cell) => `<div class="view-item"><span>${cell.dataset.label}</span><strong>${cell.innerText.trim().replace(/\n+/g, ' · ')}</strong></div>`).join(''); target.showModal(); } return;
    }
    if (/cancel|clear form/i.test(button.textContent)) { const form = button.closest('form'); if (form) { event.preventDefault(); form.reset(); button.closest('dialog')?.close(); } }
  };
  const handleSubmit = (event) => {
    const form = event.target;
    if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); return; }
    event.preventDefault();
    // Login is a navigation action, not a record-saving form.
    if (form.id === 'loginForm') {
      const role = form.querySelector('[name="role"]')?.value;
      const routes = { registration: 'registration/registration.html', doctor: 'doctor/doctor.html', lab: 'lab/lab.html', pharmacy: 'pharmacy/pharmacy-dashboard.html', admin: 'admin/admin.html' };
      if (routes[role]) { navigate(routes[role]); return; }
    }
    // Creating an account returns the user to sign-in; all other forms save locally.
    if (page === 'signup.html') { navigate('login.html'); setToast('Account created. Please sign in.'); return; }
    form.reset(); form.closest('dialog')?.close(); setToast('Saved successfully. This prototype stores changes only for the current session.');
  };

  return <><Toast text={toast} /><div ref={host} onClick={handleClick} onSubmit={handleSubmit} dangerouslySetInnerHTML={{ __html: markup }} />{loading && <main className="react-status">Loading Svasthya…</main>}{error && <main className="react-status">{error}</main>}</>;
}

createRoot(document.getElementById('root')).render(<App />);
