/**
 * ClassChain Indexer
 *
 * Project Registry
 *
 * Reads the existing Projects.json registry.
 *
 * IMPORTANT:
 * This module does NOT contain network/project/treasury configuration.
 * It only discovers what already exists in the platform registry.
 */

export class ProjectRegistry {

    constructor(projects) {

        if (!Array.isArray(projects)) {
            throw new TypeError(
                'Projects registry must be an array.'
            );
        }

        this.projects = projects;
    }


    getProjects() {

        return this.projects;
    }


    getProject(projectId) {

        const normalizedId =
            String(projectId);

        return this.projects.find(
            project =>
                String(project.ProjectID) === normalizedId
        ) || null;
    }


    discoverTreasuries() {

        const result = [];

        for (const project of this.projects) {

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


            for (const [networkId, fund] of Object.entries(funds)) {

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
