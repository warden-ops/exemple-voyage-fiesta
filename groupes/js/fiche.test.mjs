import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conseillerLine,
  demandePayload,
  groupLinks,
  isReadableService,
  itineraryLines,
  publicDate,
  readableServices,
  visibleRates
} from './fiche.mjs';

test('tarifs sans vrai libellé disparaissent, y compris Option N et Tarif', () => {
  assert.deepEqual(visibleRates([
    { categorie: 'Tarif', prix: 663 },
    { categorie: '', prix: 775 },
    { categorie: 'Option 2', prix: 900 }
  ]), []);
  assert.deepEqual(visibleRates([
    { categorie: 'Cabine intérieure', prix: 1290 },
    { categorie: 'Tarif', prix: 900 },
    { categorie: 'Option 3', prix: 1000 }
  ]).map((row) => row.categorie), ['Cabine intérieure']);
});

test('itinéraire sans port est masqué, un port est écrit en français', () => {
  assert.deepEqual(itineraryLines([
    { ordre: 1, titre: '', description: '<p>Départ: 17:00</p>' },
    { ordre: 2, titre: '', description: '<p>Arrivée: 07:00 / Départ: 18:00</p>' }
  ]), []);
  assert.deepEqual(itineraryLines([
    { ordre: 1, lieu: 'Miami', description: '<p>Départ: 17:00</p>' },
    { ordre: 2, lieu: 'Nassau', description: '<p>Arrivée: 07:00 / Départ: 18:30</p>' },
    { ordre: 3, titre: '', description: '<p>Arrivée: 08:00</p>' },
    { ordre: 4, lieu: 'Cozumel' }
  ]), [
    'Jour 1 : Miami, départ 17 h',
    'Jour 2 : Nassau, arrivée 7 h, départ 18 h 30',
    'Jour 4 : Cozumel'
  ]);
});

test('services bruts sortent, les noms lisibles restent', () => {
  assert.equal(isReadableService('2015-01-01'), false);
  assert.equal(isReadableService('294.00'), false);
  assert.equal(isReadableService('110/220 V'), false);
  assert.equal(isReadableService('true'), false);
  assert.equal(isReadableService('N/A'), false);
  assert.equal(isReadableService('1970'), false);
  assert.deepEqual(readableServices([
    '2015-01-01', '294.00', 'Salon de beauté', 'true', 'WIFI', '110/220 V', 'N/A', 'Salon de beauté'
  ]), ['Salon de beauté', 'WIFI']);
});

test('une date 1970 ne s\'affiche pas', () => {
  assert.equal(publicDate('1970-01-01'), '');
  assert.equal(publicDate('2026-11-01'), '1 novembre 2026');
});

test('la fiche nomme le conseiller du lien, et n\'affiche rien sans nom', () => {
  const html = conseillerLine(
    { name: 'Éric Lacasse', slug: 'eric-lacasse' },
    '/agents/eric-lacasse/?ref=eric-lacasse&ghl_user=fG599Arfh45eLVOMCMLh'
  );
  assert.match(html, /Ton conseiller : /);
  assert.match(html, />Éric Lacasse<span class="sr-only">, page du conseiller<\/span><\/a>/);
  assert.match(html, /href="\/agents\/eric-lacasse\/\?ref=eric-lacasse&amp;ghl_user=fG599Arfh45eLVOMCMLh"/);
  assert.doesNotMatch(html, /[—–]|[\u{1F300}-\u{1FAFF}]/u);
  assert.equal(conseillerLine(null, '/agents/eric-lacasse/'), '');
  assert.equal(conseillerLine({ name: '   ' }, '/agents/eric-lacasse/'), '');
  const plain = conseillerLine({ name: 'Kevin Watier' }, '');
  assert.match(plain, /Ton conseiller : Kevin Watier/);
  assert.doesNotMatch(plain, /<a /);
  const unsafe = conseillerLine({ name: 'A <b> & "c"' }, 'javascript:alert(1)');
  assert.match(unsafe, /A &lt;b&gt; &amp; &quot;c&quot;/);
  assert.doesNotMatch(unsafe, /<b>|<script/);
});

test('Détails et Réserver gardent ref, ghl_user et utm', () => {
  const source = 'ref=eric-lacasse&ghl_user=fG599Arfh45eLVOMCMLh&utm_source=facebook&utm_medium=social&utm_campaign=hiver&page=2';
  const links = groupLinks({ id: 15, slug: 'grand-caiman-et-mexique' }, { source, embed: true });
  const detail = new URL(links.detail, 'https://aubaineexpress.voyagefiesta.ca');
  const reserve = new URL(links.reserve, 'https://aubaineexpress.voyagefiesta.ca');
  assert.equal(detail.searchParams.get('id'), '15');
  assert.equal(detail.searchParams.get('slug'), 'grand-caiman-et-mexique');
  assert.equal(detail.searchParams.get('ref'), 'eric-lacasse');
  assert.equal(detail.searchParams.get('ghl_user'), 'fG599Arfh45eLVOMCMLh');
  assert.equal(detail.searchParams.get('utm_source'), 'facebook');
  assert.equal(detail.searchParams.get('utm_medium'), 'social');
  assert.equal(detail.searchParams.get('utm_campaign'), 'hiver');
  assert.equal(detail.searchParams.get('page'), null);
  assert.equal(detail.searchParams.get('embed'), '1');
  assert.equal(reserve.hash, '#form-fiche');
  assert.equal(reserve.searchParams.get('utm_campaign'), 'hiver');
  const advised = groupLinks({ id: 15, slug: 'grand-caiman-et-mexique' }, {
    source,
    agent: { slug: 'sarah-jean-philippe', id: 'AbCdEfGh12345678' }
  });
  const advisedUrl = new URL(advised.reserve, 'https://aubaineexpress.voyagefiesta.ca');
  assert.equal(advisedUrl.searchParams.get('ref'), 'sarah-jean-philippe');
  assert.equal(advisedUrl.searchParams.get('ghl_user'), 'AbCdEfGh12345678');
  assert.equal(advisedUrl.searchParams.get('utm_source'), 'facebook');
  assert.equal(advisedUrl.hash, '#form-fiche');
});

test('la demande de réservation reprend le voyage sans appel réseau', () => {
  const payload = demandePayload({
    id: 15,
    type: 'cruise',
    title: 'Grand Caïman et Mexique',
    destination: 'Grand Caïman',
    dateDepart: '2026-11-01',
    dureeJours: 8,
    dureeNuits: 7,
    prixAppel: 663,
    navire: 'Celebrity Summit'
  }, {
    full_name: 'Alex Roy',
    email: 'alex@example.com',
    phone: '5145551212',
    adults: '2',
    children: '0',
    message: 'Cabine balcon',
    provider: 'Celebrity'
  }, { dryRun: true, pageUrl: 'https://aubaineexpress.voyagefiesta.ca/groupes/groupe/?id=15#form-fiche' });
  assert.equal(payload.request_type, 'demande_groupe');
  assert.equal(payload.groupe_id, '15');
  assert.equal(payload.groupe_titre, 'Grand Caïman et Mexique');
  assert.equal(payload.forfait_name, 'Grand Caïman et Mexique');
  assert.equal(payload.navire, 'Celebrity Summit');
  assert.equal(payload.dry_run, true);
  assert.equal(payload.p1_prenom, 'Alex');
  assert.equal(payload.p1_nom, 'Roy');
  assert.match(payload.groupe_url, /id=15/);
});
