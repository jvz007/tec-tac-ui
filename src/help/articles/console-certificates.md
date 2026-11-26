# Engineer Console certificates

The Engineer Console is the desktop tool an engineer uses to open a tunnel to a device. A Console certificate lets Core tell which engineer's PC is asking. Core 1.18.52 issues the certificates. It does not check them yet, so nothing stops working if you have none.

A **certificate authority** (CA) is a key pair that Core owns. Core signs every certificate with it. Core keeps the private half encrypted.

## Enrol your PC (everyone)

1. An administrator allows you to enrol. The permission lasts 7 days.
2. Open **My Account**. The **Console certificate** card now shows **Enrol this PC**.
3. Press it. You see a one-time code and a countdown. The code works once and stops after 10 minutes.
4. Choose **Open the Engineer Console**, or **Copy code** and paste it into the Console.

If no one has allowed you yet, the card says: Ask your administrator to issue you a Console certificate.

The code is never stored in your browser. It disappears when the countdown ends or when you leave the page. Press **Enrol this PC** again for a new one.

You can hold up to 3 active certificates. Enrolling the same PC again replaces its older certificate.

## Revoke your own certificate

On the card or on the Console certificates page, press **Revoke**, pick a reason, and answer Yes. Do this if a PC is lost. Revoking does not end a session that is already open.

## The Console certificates page

Open **Administration > Console certificates**, or choose **Manage my certificates** on My Account. Everyone sees their own rows. People with the `core.console_certificates.view` or `core.console_certificates.manage` permission see every row.

- **View:** filter by engineer and state, see open enrolments, and read the CA panel. The CA panel warns when the authority ends within a year or when Core cannot read its master key.
- **Manage:** also allow an engineer to enrol, cancel an open enrolment, and revoke any certificate. Manage includes view.
- **Superuser:** also **Replace CA**. This revokes every active certificate, cancels every open enrolment and changes the server id. Engineers must be allowed again and enrol again. It does not end a session that is already open.

Add both permissions to a role on **Access > Roles & permissions**, in the Console certificates group.

## The validity setting

**System Configuration** has a card for how many days a new certificate lasts: 1 to 730, 365 by default. A change affects new certificates only. Only a superuser can change it.

## Finding a certificate in the audit log

Open the **Audit** page and search for the certificate's serial (the long number that identifies it), or for the actions `custom:console-cert-issued`, `custom:console-cert-revoked` and `custom:console-cert-refused`. The issue row is under the engineer who enrolled. A person's own revoke is under that person. An administrator's revoke is under the administrator.
