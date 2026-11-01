import { SnapshotReceiver } from "../../app/js/core/snapshot-delta.js";

const receivers = new WeakMap();
export function installSnapshotReceiver(socket) {
  if (receivers.has(socket)) return;
  const receiver = new SnapshotReceiver();
  receivers.set(socket, receiver);
  socket.prependAny((event, packet) => {
    if (!packet?.sync) return;
    const decoded = receiver.receive(event, packet);
    for (const key of Object.keys(packet)) delete packet[key];
    Object.assign(packet, decoded);
  });
}
export function decodeResponse(socket, response) {
  if (response.game?.sync)
    response.game = receivers.get(socket).receive("game:state", response.game);
  return response;
}
