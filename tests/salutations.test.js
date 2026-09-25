import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salutation } from '../src/partage/salutations.js';

const a = (iso, prenom = '') => salutation({ prenom, maintenant: new Date(iso) });

test('« Bonjour » jusqu’à 18 h, « Bonsoir » ensuite et jusqu’à 5 h', () => {
  assert.equal(a('2026-09-24T05:00', 'Camille').titre, 'Bonjour Camille');
  assert.equal(a('2026-09-24T12:30', 'Camille').titre, 'Bonjour Camille');
  assert.equal(a('2026-09-24T17:59', 'Camille').titre, 'Bonjour Camille');
  assert.equal(a('2026-09-24T18:00', 'Camille').titre, 'Bonsoir Camille');
  assert.equal(a('2026-09-24T23:30', 'Camille').titre, 'Bonsoir Camille');
  assert.equal(a('2026-09-25T04:59', 'Camille').titre, 'Bonsoir Camille');
});

test('le jour de la semaine passe par la phrase, pas par le titre', () => {
  // « Bonne semaine », « Bon dimanche » se disent plutôt en partant.
  assert.equal(a('2026-09-21T08:00').titre, 'Bonjour'); // lundi matin
  assert.equal(a('2026-09-27T11:00').titre, 'Bonjour'); // dimanche
  assert.match(a('2026-09-25T16:00').phrase, /week-end/); // vendredi après-midi
  // Le week-end, sa phrase vaut dès 5 h, sans bascule en cours de matinée.
  assert.equal(a('2026-09-26T06:00').phrase, a('2026-09-26T10:00').phrase);
  assert.match(a('2026-09-26T06:00').phrase, /week-end/);
  // Le soir, même le week-end, c'est « Bonsoir ».
  assert.equal(a('2026-09-26T21:00').titre, 'Bonsoir');
});

test('chaque moment a sa phrase', () => {
  assert.equal(a('2026-09-24T09:00').phrase, 'Voici où en est votre activité ce matin.');
  assert.equal(a('2026-09-21T09:00').phrase, 'Voici où en est votre activité en ce début de semaine.');
  assert.equal(a('2026-09-24T12:59').phrase, 'Voici où en est votre activité ce midi.');
  assert.equal(a('2026-09-24T13:00').phrase, 'Voici où en est votre activité cet après-midi.');
  assert.equal(a('2026-09-24T15:00').phrase, 'Voici où en est votre activité cet après-midi.');
  assert.equal(a('2026-09-24T19:00').phrase, 'Voici où en est votre activité ce soir.');
  assert.equal(a('2026-09-26T10:00').phrase, 'Voici où en est votre activité ce week-end.');
});

test('tard, une phrase pour le travail tardif, juste avant comme après minuit', () => {
  // Après minuit, « ce soir » serait faux.
  const tard = 'Même à cette heure tardive, voici où en est votre activité.';
  assert.equal(a('2026-09-24T23:30').phrase, tard);
  assert.equal(a('2026-09-25T02:00').phrase, tard);
});

test('sans prénom, la salutation reste entière ; un prénom prend sa majuscule', () => {
  assert.equal(a('2026-09-24T09:00').titre, 'Bonjour');
  assert.equal(a('2026-09-24T09:00', '  raphaël ').titre, 'Bonjour Raphaël');
});

test('aucune phrase ne prétend que les comptes sont à jour, ni ne sort du ton neutre', () => {
  // Une semaine, heure par heure : chaque moment passe au moins une fois.
  for (let jour = 21; jour <= 27; jour += 1) {
    for (let heure = 0; heure < 24; heure += 1) {
      const { phrase } = salutation({ maintenant: new Date(2026, 8, jour, heure) });
      assert.doesNotMatch(phrase, /à jour|tranquille/, `${jour} septembre, ${heure} h`);
      assert.doesNotMatch(phrase, /votre journée|ouvrage|se fait tard|éteindre|demain|pause|ligne droite|\?/, `${jour} septembre, ${heure} h`);
    }
  }
});

test('une déclaration à faire prend la place de la phrase du jour', () => {
  const rappel = 'Votre déclaration URSSAF pour juillet est à faire avant le 31 août.';
  const avec = salutation({ prenom: 'Camille', maintenant: new Date('2026-08-25T09:00'), rappel });
  assert.equal(avec.phrase, rappel);
  assert.equal(avec.titre, 'Bonjour Camille');
});

test('la date du jour, en toutes lettres', () => {
  assert.equal(a('2026-09-24T09:00').jour, 'Jeudi 24 septembre 2026');
  assert.equal(a('2026-10-01T09:00').jour, 'Jeudi 1er octobre 2026');
});
