# API keys and single sign-on

Use API keys to let a script or tool call Tactical without anyone's password. Use single sign-on to let people sign in with your company's identity provider instead of a Tactical password.

## API keys

An API key is a long code that a script or tool sends to Tactical. Each key belongs to one Tactical user, and it can expire.

- **Access > API keys** lists every key with its name, owner and expiry.
- **Show** and **Copy** reveal a key's value. You need the Manage API keys permission for this. Without it, the value stays hidden.
- **Add API key** creates one. Tactical makes the value, so Tec-Tac shows it once in a dialog. Copy it then. You can read it again in the list later.
- **Edit** changes the name, the owner and the expiry. The value itself does not change.
- **Delete** removes the key. Anything that uses it stops working.

Keys hidden by account protection show as "Hidden by account protection". Only an effective superuser can see or change them.

## Single sign-on

Single sign-on, or SSO, lets people sign in with the accounts your organisation already uses. Access > Single sign-on lists each provider and the two sign-in settings.

- **Allow sign-in with single sign-on** turns SSO on or off.
- **Block local sign-in with passwords** stops everyone from signing in with a Tactical password. Before you turn it on, Tec-Tac asks you to confirm. Keep at least one provider in place first. Tec-Tac will not let you block local sign-in with no provider, or delete the last provider while blocking is on.
- A local superuser account can still sign in while local sign-in is blocked. Keep that account and its password safe.
- The client secret is shown only to a superuser. Everyone else sees [REDACTED].

To unlink one person from a provider, open the user in Access > Users. Under Single sign-on accounts, choose Disconnect. The Tactical account stays. Only a superuser can do this.

Only a Tec-Tac superuser can add, change or delete providers, change the settings or disconnect an account. Other roles see the list and the settings read-only.
