# System Configuration

System Configuration holds settings that change how Tec-Tac itself runs. Open it from **Administration > System Configuration**.

## Module start-up time limit

When Tec-Tac loads, each module's page code gets a short time to start. If a module takes longer, Tec-Tac marks it failed and carries on with the next one. This setting is that time limit.

- **Range:** 5 to 300 seconds, whole numbers only.
- **Default:** 30 seconds.
- The limit covers the module's page code starting up. It does not cover work the module does after you sign in.

Raise the limit if a healthy module is marked failed on a slow connection or a busy server. Keep it as low as you can: a module that really is stuck holds up every module after it until the limit passes.

## Who can change it

A superuser, or an administrator with the `core.privileged_operations` or `core.runtime_settings.manage` permission. Everyone else does not see the menu entry. If they open the address directly, they see a message that the page is not available. Core checks the permission again when you save, so hiding the page is a convenience, not the protection.

## When a change applies

A change applies the next time the page loads. Reload Tec-Tac after saving to see the effect.
