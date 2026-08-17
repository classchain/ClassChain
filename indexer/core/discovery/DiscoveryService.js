/**
 * ClassChain Indexer
 *
 * Discovery Service
 *
 * Converts platform registry entries into
 * validated treasury descriptors.
 *
 * IMPORTANT:
 * - Does not contain project configuration.
 * - Does not contain network configuration.
 * - Does not access blockchain.
 * - One invalid treasury must not stop discovery
 *   of other valid treasuries.
 */

export class DiscoveryService {

    constructor(
        projectRegistry,
        networkResolver
    ) {

        this.projectRegistry =
            projectRegistry;

        this.networkResolver =
            networkResolver;
    }


    discover() {

        const discovered =
            this.projectRegistry
                .discoverTreasuries();

        const valid = [];
        const invalid = [];


        for (const treasury of discovered) {

            try {

                const network =
                    this.networkResolver.resolve(
                        treasury.networkId
                    );


                const token =
                    this.networkResolver.resolveToken(
                        treasury.networkId,
                        'USDT'
                    );


                valid.push({

                    projectId:
                        treasury.projectId,

                    networkId:
                        treasury.networkId,

                    address:
                        treasury.address,

                    active:
                        treasury.active,

                    createdAt:
                        treasury.createdAt,

                    network,

                    token

                });

            } catch (error) {

                invalid.push({

                    ...treasury,

                    status:
                        'INVALID_CONFIGURATION',

                    error:
                        error instanceof Error
                            ? error.message
                            : String(error)

                });

            }
        }


        return {

            valid,

            invalid

        };
    }
}
