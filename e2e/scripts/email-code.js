// Reads the 6-digit sign-in code from the newest email to EMAIL in Mailpit, the local mail
// catcher that `supabase start` runs (http://localhost:54324). Maestro runs this file with
// runScript; the code comes back as output.code for the next inputText.
//
// Supabase Auth hands the email to Mailpit before the app moves on to "Enter the code", so
// the email is normally there already. If not, the sign-in flow retries this script.
// run.sh empties the mailbox before each flow, so an old code can't be picked up.
var MAILPIT = 'http://localhost:54324/api/v1';

var list = json(http.get(MAILPIT + '/search?query=' + encodeURIComponent('to:"' + EMAIL + '"')).body);
var newest = list.messages && list.messages[0];
if (!newest) throw new Error('No email to ' + EMAIL + ' yet');

var message = json(http.get(MAILPIT + '/message/' + newest.ID).body);
// The template's hidden preview line says "Your code 123456" (supabase/templates/code.html).
var found = /Your code (\d{6})/.exec(message.HTML || '');
if (!found) throw new Error('The email to ' + EMAIL + ' has no code in it');
output.code = found[1];
