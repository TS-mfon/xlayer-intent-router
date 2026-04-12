# Contracts

`IntentRouterVault` is the X Layer policy layer for agentic swap execution.

The vault does not discover routes. It accepts route calldata only after the app/agent has already quoted and simulated the intent. The contract only enforces the minimum onchain guarantees: funded intent, approved executor, allowlisted router, live deadline, single execution, and minimum output.
