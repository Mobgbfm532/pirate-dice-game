// The database side of db.js (the leaderboard and who has met whom), on pg-mem: an in-memory
// stand-in for Postgres, so the SQL is checked without a real database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const { postgresStore } = require('../db');

function freshStore() {
    const { Pool } = newDb().adapters.createPg();
    return postgresStore('postgres://test@localhost/game', Pool);
}

test('the leaderboard keeps each name\'s best run, highest first', async () => {
    const store = freshStore();
    await store.ready;
    await store.saveLeaderboard(null, { name: 'Ann', points: 300, gold: 20 });
    await store.saveLeaderboard(null, { name: 'Bo', points: 500, gold: 5 });
    await store.saveLeaderboard(null, { name: 'Ann', points: 200, gold: 90 }); // worse: ignored
    await store.saveLeaderboard(null, { name: 'Bo', points: 650, gold: 7 });  // better: replaces
    assert.deepEqual(await store.loadLeaderboard(), [
        { name: 'Bo', points: 650, gold: 7 },
        { name: 'Ann', points: 300, gold: 20 }
    ]);
});

test('who a player has met is kept by name, whatever its case or spaces, once each', async () => {
    const store = freshStore();
    await store.addMet('Ann', 'molar');
    await store.addMet(' ann ', 'thom');
    await store.addMet('ANN', 'molar');
    await store.addMet('Bo', 'frak');
    assert.deepEqual((await store.loadMet('Ann')).sort(), ['molar', 'thom']);
    assert.deepEqual(await store.loadMet('Bo'), ['frak']);
    assert.deepEqual(await store.loadMet('Cy'), []);
});
