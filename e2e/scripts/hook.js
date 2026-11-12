// Runs one database hook (scripts/hooks.py) from inside a flow. Needs HOOK, the name of a
// file in sql/hooks/ without .sql.
var res = http.post('http://localhost:8787/hook/' + HOOK, { body: '' });
if (res.status !== 200) throw new Error('hook ' + HOOK + ' failed: ' + res.body);
