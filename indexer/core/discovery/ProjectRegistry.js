/**
 * ClassChain Indexer
 *
 * Project Registry Adapter
 *
 * Reads the existing ClassChain Projects.json structure.
 *
 * IMPORTANT:
 * This class adapts the existing GIS registry.
 * It does NOT redefine or duplicate project configuration.
 */

export class ProjectRegistry {

    constructor(registry) {

        if (
            !registry ||
            typeof registry !== 'object' ||
            !Array.isArray(registry.features)
        ) {
            throw new TypeError(
                'Projects registry must contain a features array.'
            );
        }

        this.features =
            registry.features;
    }


    getProjects() {

        return this.features
            .map(feature =>
                feature?.attributes
            )
            .filter(Boolean);
    }


    getProject(projectId) {

        const normalizedId =
            String(projectId);

        return this.getProjects()
            .find(
                project =>
                    String(project.ProjectID) ===
                    normalizedId
            ) || null;
    }


    discoverTreasuries() {

        const result = [];


        for (const project of this.getProjects()) {

            const projectId =
                String(project.ProjectID);


            const funds =
                project.funds;


            if (
                !funds ||
                typeof funds !== 'object'
            ) {
                continue;
            }


            for (
                const [networkId, fund]
                of Object.entries(funds)
            ) {

                if (
                    !fund ||
                    typeof fund !== 'object'
                ) {
                    continue;
                }


                const address =
                    fund.address;


                if (
                    !address ||
                    typeof address !== 'string'
                ) {
                    continue;
                }


                result.push({

                    projectId,

                    networkId,

                    address,

                    active: true,

                    createdAt:
                        fund.createdAt || null

                });

            }
        }


        return result;
    }
}
