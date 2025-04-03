use dotenv::dotenv;
use tokio_postgres::{Client, Error as PgError};
use tokio_postgres::NoTls;
use std::env;
use warp::Filter;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;
use std::sync::Arc;
use warp::http::HeaderMap;
use futures::{StreamExt, SinkExt};
use tokio::sync::Mutex;
use libp2p::core::transport::Transport;
use libp2p::swarm::SwarmBuilder;
use libp2p::noise as libp2p_noise;
use libp2p::{
    core::upgrade,
    identity,
    //noise,
    swarm::{Swarm, SwarmEvent},
    tcp,
    yamux,
    PeerId,
    //Transport,
};
struct AppState{
    db:Arc<Mutex<Client>>,
}
async fn connect_to_db()-> Result<Client, PgError> {
    let user = env::var("neoink_user").unwrap_or_else(|_| "postgres".to_string());
    let password = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let host = env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let dbname = env::var("neolink").unwrap_or_else(|_| "neolink".to_string());
    let port = env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());

    let _connection_string = format!(
        "host={} port={} user={} password={} dbname={}",
        host, port, user, password, dbname
    );
    let (client, _connection) =
    tokio_postgres::connect("host=localhost user=postgres",NoTls).await?;
    Ok(client)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message {
    id: String,
    content: String,
    sender: String,
    node_id: String,
    timestamp: i64,
}

type Peers = Arc<Mutex<HashMap<String, futures::stream::SplitSink<warp::ws::WebSocket, warp::ws::Message>>>>;

#[derive(Debug)]
struct AuthError;
impl warp::reject::Reject for AuthError {}

async fn auth_middleware(
    header: HeaderMap,
    _peers: Peers,
) -> Result<impl warp::Reply, warp::Rejection> {
    let _token = match header.get("Authorization") {
        Some(t) => t.to_str().unwrap_or_default(),
        None => return Err(warp::reject::custom(AuthError)),
    };
    Ok(warp::reply::json(&"Authenticated"))
}

#[tokio::main]
async fn main() ->Result<(),Box<dyn std::error::Error>>{
    dotenv().ok();
    let db_user=std::env::var("DB_USER").unwrap_or_else(|_| "postgres".to_string());
    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("PORT")
        .unwrap_or_else(|_| "3030".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");
    println!("Connecting to database...");

    println!("Starting WebSocket server on {}:{}", host, port);
    let ws_route = warp::path("ws").map(|| warp::reply::html("WebSocket Connected"));
    warp::serve(ws_route)
        .run((host.parse::<std::net::IpAddr>().unwrap(), port))
        .await;


    let peers: Peers = Arc::new(Mutex::new(HashMap::new()));

    // Generate a new key pair
    let local_key = identity::Keypair::generate_ed25519();
    let local_peer_id = PeerId::from(local_key.public());
    println!("Local peer id: {:?}", local_peer_id);

    // Create a transport
    let tcp_transport = tcp::tokio::Transport::new(tcp::Config::default().nodelay(true));

    // Create an authenticated transport using noise
    let keypair=identity::Keypair::generate_ed25519();
    let noise_config = libp2p_noise::Config::new(&local_key)
        .expect("Signing libp2p-noise static DH keypair failed.");

    let transport = tcp_transport
        .upgrade(upgrade::Version::V1)
        .authenticate(noise_config)
        .multiplex(yamux::Config::default())
        .boxed();

    // Create a ping network behavior
    let behaviour = libp2p::ping::Behaviour::new(libp2p::ping::Config::new());

    // Create a Swarm to manage peers and events
    let mut swarm = SwarmBuilder::with_tokio_executor(transport,behaviour,local_peer_id)
        .build();

    // Listen on all interfaces
    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse().unwrap())?;

    // Set up WebSocket route
    let ws_route = get_ws_route(peers.clone());

    // Start the server and P2P network
    tokio::join!(
        async {
            warp::serve(ws_route)
                .run(([127, 0, 0, 1], 3030))
                .await;
        },
        async {
            loop {
                match swarm.next().await {
                    Some(SwarmEvent::NewListenAddr { address, .. }) => {
                        println!("Listening on {:?}", address);
                    }
                    Some(SwarmEvent::Behaviour(libp2p::ping::Event { peer, result, .. })) => {
                        println!("Ping to {:?}: {:?}", peer, result);
                    }
                    _ => {}
                }
            }
        }
    );
    Ok(())
}

fn get_ws_route(peers: Peers) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    warp::path("ws")
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let peers = peers.clone();
            ws.on_upgrade(move |websocket| handle_connection(websocket, peers))
        })
}

async fn handle_connection(socket: warp::ws::WebSocket, peers: Peers) {
    let (ws_tx, mut ws_rx) = socket.split();
    let peer_id = Uuid::new_v4().to_string();

    peers.lock().await.insert(peer_id.clone(), ws_tx);

    while let Some(result) = ws_rx.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("Error receiving message: {}", e);
                break;
            }
        };

        if let Ok(text) = msg.to_str() {
            match serde_json::from_str::<Message>(text) {
                Ok(message) => {
                    broadcast(&peers, message).await;
                }
                Err(e) => {
                    eprintln!("Error parsing message: {}", e);
                }
            }
        }
    }

    peers.lock().await.remove(&peer_id);
}

async fn broadcast(peers: &Peers, msg: Message) {
    let mut peers_lock = peers.lock().await;
    let json_msg = serde_json::to_string(&msg).unwrap();

    for (_, peer) in peers_lock.iter_mut() {
        if let Err(e) = peer.send(warp::ws::Message::text(json_msg.clone())).await {
            eprintln!("Error sending message: {}", e);
        }
    }
}
