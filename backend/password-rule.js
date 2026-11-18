// The one rule for a new password, wherever one is set: sign-in reset, Profile,
// the client portal, Users (one, edited, bulk) and Client Master's client logins.
// Existing passwords are not checked; only a password being set now is.
// Six characters fall to a guessing script in minutes; eight is the floor.
const MIN_PASSWORD = 8;

// The message to show, or null when the password is long enough.
function passwordProblem(password) {
  return String(password == null ? '' : password).length < MIN_PASSWORD
    ? `Password must be at least ${MIN_PASSWORD} characters`
    : null;
}

module.exports = { MIN_PASSWORD, passwordProblem };
