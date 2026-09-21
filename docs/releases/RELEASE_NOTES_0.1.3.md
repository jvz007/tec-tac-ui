# Tec-Tac UI 0.1.3

## Access management

0.1.3 turns the Access area into the first operational administration surface.

### Users
- Lists Tactical users through Tactical's native `/accounts/users/` API.
- Creates users with username, names, email, initial password, and role.
- Updates active state, dashboard-login state, contact fields, and role assignment.
- Supports password reset, TOTP reset, and user deletion with confirmation.
- Tactical remains authoritative and protects the installation/root user.

### Roles & permissions
- Lists and creates Tactical roles through Tactical's native role API.
- Edits Tactical's native boolean RBAC permissions in grouped operator-friendly sections.
- Preserves Tactical client/site scope fields even though 0.1.3 does not yet edit those scopes.
- Integrates with Tec-Tac backend 1.1.0 to display and edit first-class extension permission grants.
- Superuser roles are clearly identified.

### Session
- Resolves current identity, role and effective superuser state when backend 1.1.0 is installed.
- Adds logout in the top-right account area and in My Session.
- Logout invalidates the Tactical Knox token and clears the Tec-Tac browser session.

## Compatibility

The shell still authenticates directly against Tactical. User and native-role administration use Tactical APIs and Tactical RBAC. Tec-Tac-specific permission management requires the paired Tec-Tac backend 1.1.0 access API.

Module discovery/install remains the next separate workstream.
