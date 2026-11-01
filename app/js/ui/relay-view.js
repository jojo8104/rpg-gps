import { closeSheet } from "./bottom-sheet.js";

function prepare(element, titleText, onClose) {
  closeSheet(element);
  element.hidden = false;
  const document = element.ownerDocument;
  const close = document.createElement("button");
  close.textContent = "Fermer";
  close.onclick = onClose;
  const title = document.createElement("h2");
  title.textContent = titleText;
  element.append(close, title);
  return { document, isOpen: () => !element.hidden && element.contains(close) };
}
export function renderRelayCompose({ element, recipients, onClose, onSend }) {
  const { document, isOpen } = prepare(element, "Envoyer un messager", onClose);
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Destinataire");
  for (const player of recipients) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    select.append(option);
  }
  const message = document.createElement("textarea");
  message.maxLength = 500;
  message.setAttribute("aria-label", "Message");
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  const send = document.createElement("button");
  send.textContent = "Envoyer";
  send.disabled = !recipients.length;
  send.onclick = async () =>
    await onSend({ recipientPlayerId: select.value, text: message.value });
  element.append(select, message, send, feedback);
  return {
    isOpen,
    setBusy(value) {
      send.disabled = value || !recipients.length;
    },
    setFeedback(text) {
      feedback.textContent = text;
    },
    clearMessage() {
      message.value = "";
    },
  };
}
export function renderRelayInbox({ element, messages, onClose }) {
  const handle = prepare(element, "Courrier reçu", onClose);
  const document = handle.document;
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.textContent = "Aucun messager arrivé.";
    element.append(empty);
  }
  for (const message of messages) {
    const row = document.createElement("article");
    const sender = document.createElement("strong");
    sender.textContent = message.senderName;
    const body = document.createElement("p");
    body.textContent = message.text;
    row.append(sender, body);
    element.append(row);
  }
  return handle;
}
