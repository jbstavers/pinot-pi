# Workflow reference

Pinot provides `/pinot-spec`, `/pinot-plan`, `/pinot-implement`, `/pinot-debug`, `/pinot-debrief`, and `/pinot-janitor`. They are generic prompts for the current project and the user’s existing Pi setup.

```text
/pinot-spec → /pinot-plan → /pinot-implement → /pinot-debrief
                                      ↘ /pinot-janitor
```

- **Spec** turns an idea into a convergent living specification without selecting a provider or model.
- **Plan** turns a settled brief into an evidence-grounded, standalone execution plan.
- **Implement** coordinates one durable Herdr writer through `pinot_native_herdr_implementer`, uses `pinot_run_test_suite` when the plan calls for it, and keeps the parent as coordinator.
- **Debug** establishes a bounded diagnosis first. A production fix goes through one durable Herdr implementer rather than direct parent editing.
- **Debrief** starts with the user-owned implementation-history index, follows safe pointers, and verifies consequential claims against current evidence.
- **Janitor** runs a bounded `closeout`, `docs`, or `sweep` assignment through the durable Herdr implementer and the package-owned skill. It is the sole writer during its assignment, preserves uncertainty, and does not commit or delegate.

The state root defaults to `~/.pinot-pi` and may be changed with `PINOT_STATE_DIR`. Setup is explicit, idempotent, and non-overwriting. Pi package resources coexist with the user’s Pi configuration and agents. Herdr is separately installed and configured; it is required for `/pinot-implement`, every `/pinot-janitor` run, and production fixes routed from `/pinot-debug`. Spec, plan, Debrief, and debug diagnosis do not require it, nor do setup/status, background read-only delegation, or the bounded test runner.
