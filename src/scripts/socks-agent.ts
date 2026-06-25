import * as http from 'http';
import * as tls from 'tls';
import * as net from 'net';
import { Agent, AgentConnectOpts } from 'agent-base';
import { SocksClient, SocksProxy } from 'socks';
import { Duplex } from 'stream';

export class SocksAgent extends Agent {
    private readonly proxy: SocksProxy;

    constructor(proxyUrl: string) {
        super();
        const { hostname, port, username, password, protocol } = new URL(proxyUrl);
        const socksVersion = protocol.startsWith('socks4') ? 4 : 5;

        this.proxy = {
            type: socksVersion as 4 | 5,
            host: hostname,
            port: parseInt(port, 10),
            ...(username && { userId: decodeURIComponent(username) }),
            ...(password && { password: decodeURIComponent(password) }),
        };
    }

    async connect(req: http.ClientRequest, opts: AgentConnectOpts): Promise<Duplex> {
        const host = (opts.host ?? ('hostname' in opts ? (opts as tls.ConnectionOptions).servername : undefined) ?? 'localhost') as string;
        const port = opts.port as number;

        const { socket } = await SocksClient.createConnection({
            proxy: this.proxy,
            command: 'connect',
            destination: { host, port },
        });

        if (opts.secureEndpoint) {
            const servername = typeof opts.host === 'string' && !net.isIP(opts.host) ? opts.host : undefined;
            return tls.connect({ ...(opts as tls.ConnectionOptions), socket, servername });
        }

        return socket;
    }
}
