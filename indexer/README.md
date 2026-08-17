Indexer must consume existing ClassChain configuration.

The Indexer must NOT maintain a second configuration
for networks, RPC endpoints, factories, tokens, or decimals.

Projects.json is the project/treasury registry.

shared/network-config.js is the network/deployment/token
configuration source of truth.

Adding a project, treasury, or supported network must
not require changes to Indexer Core.
