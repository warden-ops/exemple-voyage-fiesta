import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../agent-resolve.js', import.meta.url), 'utf8');

function load(search = '', stored = null) {
  const window = {
    location: { search },
    VFLeadRef: stored ? { get: () => stored } : undefined
  };
  vm.runInNewContext(source, { window, URLSearchParams, URL, fetch, Array, Promise });
  return window.VFAgent;
}

const staff = [
  { id: 'userEric1234', slug: 'eric-lacasse', name: 'Éric Lacasse', email: 'eric@voyagefiesta.com', phone: '+15145550100' },
  { id: 'userKevin123', slug: 'kevin-watier', name: 'Kevin Watier', email: 'kevin@voyagefiesta.com', phone: '' },
  { id: 'patrickOne01', slug: 'patrick-girard', name: 'Patrick Girard', email: 'p1@voyagefiesta.com', phone: '5145550101' },
  { id: 'patrickLbh01', slug: 'patrick-girard-lbhu', name: 'Patrick Girard', email: 'p2@voyagefiesta.com', phone: '5145550102', photo: 'https://cdn.example/p2.jpg' }
];

test('ghl_user wins over a different ref slug', () => {
  const api = load('?ref=eric-lacasse&ghl_user=userKevin123');
  const agent = api.resolve(staff, api.readHint(undefined));
  assert.equal(agent.slug, 'kevin-watier');
  assert.equal(agent.id, 'userKevin123');
});

test('unknown ghl_user falls back to a known ref, then to nothing', () => {
  const api = load();
  assert.equal(api.resolve(staff, { ghlUser: 'missingUser1', ref: 'eric-lacasse' }).slug, 'eric-lacasse');
  assert.equal(api.resolve(staff, { ghlUser: 'missingUser1', ref: 'personne-inconnue' }), null);
  assert.equal(api.resolve(staff, { ghlUser: '', ref: '' }), null);
});

test('memory is used when the URL has no advisor', () => {
  const api = load('', { ref: 'patrick-girard-lbhu', ghl_user: 'patrickLbh01' });
  const agent = api.resolve(staff, api.readHint(''));
  assert.equal(agent.slug, 'patrick-girard-lbhu');
  assert.equal(agent.photo, 'https://cdn.example/p2.jpg');
});

test('a URL hint replaces the stored advisor', () => {
  const api = load('?ref=eric-lacasse', { ref: 'kevin-watier', ghl_user: 'userKevin123' });
  const agent = api.resolve(staff, api.readHint('?ref=eric-lacasse'));
  assert.equal(agent.slug, 'eric-lacasse');
});

test('card shows the initial or the photo, and the contact button uses the first name', () => {
  const api = load();
  const eric = api.resolve(staff, { ghlUser: '', ref: 'eric-lacasse' });
  const html = api.cardHtml(eric, { voyage: 'RIU <Flamingos>' });
  assert.match(html, /Votre conseiller\(ère\)/);
  assert.match(html, /vf-agent__initial[^>]*>É</);
  assert.match(html, /href="tel:\+15145550100"/);
  assert.match(html, /href="mailto:eric@voyagefiesta.com"/);
  assert.match(html, /Contacter Éric/);
  assert.match(html, /Voyage: RIU &lt;Flamingos&gt;/);
  assert.doesNotMatch(html, /[—–]|[\u{1F300}-\u{1FAFF}]/u);

  const patrick = api.resolve(staff, { ghlUser: 'patrickLbh01', ref: '' });
  const photoHtml = api.cardHtml(patrick);
  assert.match(photoHtml, /src="https:\/\/cdn\.example\/p2\.jpg"/);
  assert.doesNotMatch(photoHtml, /vf-agent__initial/);
  assert.equal(api.cardHtml(null), '');
});

test('boutique contact block shows the resolved advisor, with a page link', () => {
  const api = load('?ref=eric-lacasse&ghl_user=userEric1234');
  const html = api.shopContactHtml(api.resolve(staff, api.readHint()));
  assert.match(html, /Votre conseiller\(ère\)/);
  assert.match(html, /vf-shop-agent__name">Éric Lacasse</);
  assert.match(html, /href="tel:\+15145550100"/);
  assert.match(html, />\+15145550100</);
  assert.match(html, /href="mailto:eric@voyagefiesta.com"/);
  assert.match(html, /href="\/agents\/eric-lacasse\/"/);
  assert.match(html, />Page d'Éric Lacasse</);
  assert.doesNotMatch(html, /data-anim/);
  assert.doesNotMatch(html, /[—–]|[\u{1F300}-\u{1FAFF}]/u);
});

test('boutique contact block is absent when no advisor is resolved', () => {
  const api = load('?agent=yancie-auclair');
  assert.equal(api.readHint().ref, '');
  assert.equal(api.readHint().ghlUser, '');
  assert.equal(api.shopContactHtml(api.resolve(staff, api.readHint())), '');
  assert.equal(api.shopContactHtml(null), '');
  assert.equal(api.shopContactHtml({ name: 'Sans fiche' }), '');
});

test('boutique contact block omits a missing phone or email', () => {
  const api = load();
  const phoneOnly = api.shopContactHtml({
    id: 'userKevin123',
    slug: 'kevin-watier',
    name: 'Kevin Watier',
    email: '',
    phone: ''
  });
  assert.match(phoneOnly, /Kevin Watier/);
  assert.match(phoneOnly, /href="\/agents\/kevin-watier\/"/);
  assert.doesNotMatch(phoneOnly, /tel:|mailto:|vf-shop-agent__contacts/);

  const emailOnly = api.shopContactHtml(api.resolve(staff, { ghlUser: 'userKevin123', ref: '' }));
  assert.match(emailOnly, /href="mailto:kevin@voyagefiesta.com"/);
  assert.doesNotMatch(emailOnly, /tel:/);

  const unsafe = api.shopContactHtml({
    id: 'userEric1234',
    slug: 'eric-lacasse',
    name: 'A <b> & "c"',
    email: 'not an email',
    phone: 'appel'
  });
  assert.match(unsafe, /A &lt;b&gt; &amp; &quot;c&quot;/);
  assert.doesNotMatch(unsafe, /tel:|mailto:/);
});

test('a stored advisor still fills the boutique contact block', () => {
  const api = load('', { ref: 'patrick-girard-lbhu', ghl_user: 'patrickLbh01' });
  const html = api.shopContactHtml(api.resolve(staff, api.readHint('')));
  assert.match(html, /Patrick Girard/);
  assert.match(html, /href="\/agents\/patrick-girard-lbhu\/"/);
  assert.match(html, />Page de Patrick Girard</);
  assert.match(html, /href="mailto:p2@voyagefiesta.com"/);
});

test('the listing mounts the contact block above the hero and only from the shared advisor', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const contactAt = index.indexOf('id="vf-agent-contact"');
  const heroAt = index.indexOf('class="vf-home-hero"');
  assert.ok(contactAt > 0 && heroAt > contactAt);
  assert.match(index, /VFAgent\.prepare\('staff\.json'\)/);
  assert.match(index, /VFAgent\.shopContactHtml\(agent\)/);
  assert.match(index, /VFAgent\.current\(\)/);
  assert.doesNotMatch(index, /agent-boutique-header|data-anim="[^"]*"[\s\S]{0,80}vf-shop-agent|id="vf-agent-contact"[^>]*data-anim/);
});

test('share URL keeps the resolved advisor and drops an unknown one', () => {
  const api = load();
  const agent = api.resolve(staff, { ghlUser: 'userKevin123', ref: 'kevin-watier' });
  const url = api.shareUrl('https://aubaineexpress.voyagefiesta.ca/share/riu.html', agent, {
    utm_source: 'facebook',
    utm_medium: 'page',
    utm_campaign: 'fb-2026-10-22'
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ref'), 'kevin-watier');
  assert.equal(parsed.searchParams.get('ghl_user'), 'userKevin123');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'fb-2026-10-22');
  const plain = api.shareUrl('https://aubaineexpress.voyagefiesta.ca/product.html?slug=riu', null);
  assert.equal(new URL(plain).search, '?slug=riu');
});
