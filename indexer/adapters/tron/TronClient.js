export class TronClient {

    constructor(config) {

        if (!config) {
            throw new Error(
                'TRON client config is required'
            );
        }

        if (!config.rpc) {
            throw new Error(
                'TRON RPC endpoint is required'
            );
        }

        this.rpc = config.rpc;
    }


    async request(
        path,
        options = {}
    ) {

        const response =
            await fetch(
                `${this.rpc}${path}`,
                {
                    method:
                        options.method || 'GET',

                    headers: {
                        'Content-Type':
                            'application/json',

                        ...(options.headers || {})
                    },

                    body:
                        options.body
                            ? JSON.stringify(options.body)
                            : undefined
                }
            );


        if (!response.ok) {

            throw new Error(
                `TRON RPC HTTP ${response.status}`
            );
        }


        return response.json();
    }


    async getNowBlock() {

        return this.request(
            '/wallet/getnowblock',
            {
                method: 'POST'
            }
        );
    }
}
