#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/rpg-gps"
SERVICE_NAME="rpg-gps"
SERVICE_USER="rpggps"
SERVICE_GROUP="rpggps"

release_id="${1:-}"
archive_name="${2:-}"
caller_user="${SUDO_USER:-}"

if [[ ! "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
  echo "Identifiant de version invalide." >&2
  exit 2
fi
if [[ ! "$archive_name" =~ ^rpg-gps-[0-9]{8}-[0-9]{6}\.tar\.gz$ ]]; then
  echo "Nom d'archive invalide." >&2
  exit 2
fi
if [[ -z "$caller_user" || "$caller_user" == "root" ]]; then
  echo "Ce script doit être lancé avec sudo depuis le compte de déploiement." >&2
  exit 2
fi

caller_directory="$(getent passwd "$caller_user" | cut -d: -f6)"
archive_path="$caller_directory/$archive_name"
release_directory="$APP_ROOT/releases/$release_id"
current_link="$APP_ROOT/current"
previous_release=""

if [[ ! -f "$archive_path" ]]; then
  echo "Archive absente : $archive_path" >&2
  exit 2
fi
if [[ -e "$release_directory" ]]; then
  echo "La version $release_id existe déjà." >&2
  exit 2
fi
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
fi

cleanup() {
  rm -f -- "$archive_path"
}
trap cleanup EXIT

echo "Installation dans $release_directory"
mkdir -p "$release_directory"
tar -xzf "$archive_path" -C "$release_directory"
chown -R root:"$SERVICE_GROUP" "$release_directory"
find "$release_directory" -type d -exec chmod 750 {} +
find "$release_directory" -type f -exec chmod 640 {} +

echo "Tests du serveur"
runuser -u "$SERVICE_USER" -- sh -c "cd '$release_directory' && node --test tests/server.test.js"

echo "Activation de $release_id"
ln -sfn "$release_directory" "$current_link"

if ! systemctl restart "$SERVICE_NAME"; then
  echo "Le redémarrage a échoué, restauration de la version précédente." >&2
  if [[ -n "$previous_release" ]]; then
    ln -sfn "$previous_release" "$current_link"
    systemctl restart "$SERVICE_NAME" || true
  fi
  exit 1
fi

healthy=false
for _ in {1..10}; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  echo "Le contrôle de santé a échoué, restauration de la version précédente." >&2
  if [[ -n "$previous_release" ]]; then
    ln -sfn "$previous_release" "$current_link"
    systemctl restart "$SERVICE_NAME" || true
  else
    systemctl stop "$SERVICE_NAME" || true
  fi
  exit 1
fi

echo "Version active : $(readlink -f "$current_link")"
systemctl --no-pager --full status "$SERVICE_NAME"
