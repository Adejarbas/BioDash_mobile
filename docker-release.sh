#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<'EOF'
Uso:
  ./docker-release.sh
  ./docker-release.sh 0.8.1
  ./docker-release.sh 0.8.1 --push
  ./docker-release.sh 0.8.1 --push thiagohmn93/biodash_mobile

Fluxo semiautomatico:
  ./docker-release.sh --auto patch --push
  ./docker-release.sh --auto minor --push
  ./docker-release.sh --auto major --push

Opcoes:
  --auto [patch|minor|major]  Incrementa versao no package.json/package-lock.json
  --push                       Envia tags versionada e latest ao Docker Hub
  --image NAMESPACE/REPO       Define nome da imagem
  -h, --help                   Mostra esta ajuda
EOF
}

IMAGE_NAME="thiagohmn93/biodash_mobile"
VERSION=""
PUSH_FLAG=""
AUTO_BUMP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      PUSH_FLAG="--push"
      ;;
    --auto)
      if [[ $# -lt 2 ]]; then
        echo "Informe patch, minor ou major apos --auto"
        exit 1
      fi
      AUTO_BUMP="$2"
      shift
      ;;
    --image)
      if [[ $# -lt 2 ]]; then
        echo "Informe o nome da imagem apos --image"
        exit 1
      fi
      IMAGE_NAME="$2"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      if [[ -z "${VERSION}" && "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        VERSION="$1"
      elif [[ "$1" == */* ]]; then
        IMAGE_NAME="$1"
      else
        echo "Argumento invalido: $1"
        show_help
        exit 1
      fi
      ;;
  esac
  shift
done

if [[ -n "${AUTO_BUMP}" ]]; then
  if [[ "${AUTO_BUMP}" != "patch" && "${AUTO_BUMP}" != "minor" && "${AUTO_BUMP}" != "major" ]]; then
    echo "Valor invalido em --auto: ${AUTO_BUMP}. Use patch, minor ou major."
    exit 1
  fi

  echo "Atualizando versao sem criar tag git: ${AUTO_BUMP}"
  npm version "${AUTO_BUMP}" --no-git-tag-version
fi

if [[ -z "${VERSION}" ]]; then
  VERSION="$(node -p "require('./package.json').version")"
fi

if [[ ! -f .env ]]; then
  echo "Arquivo .env nao encontrado na raiz do projeto."
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" || -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "Variaveis EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY devem estar definidas no .env"
  exit 1
fi

echo "Construindo imagem: ${IMAGE_NAME}:${VERSION} e ${IMAGE_NAME}:latest"
docker build \
  --build-arg EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL}" \
  --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
  -t "${IMAGE_NAME}:${VERSION}" \
  -t "${IMAGE_NAME}:latest" \
  .

if [[ "${PUSH_FLAG}" == "--push" ]]; then
  echo "Enviando tags para o Docker Hub..."
  docker push "${IMAGE_NAME}:${VERSION}"
  docker push "${IMAGE_NAME}:latest"
  echo "Push concluido."
else
  echo "Build concluido. Para enviar, rode: ./docker-release.sh ${VERSION} --push ${IMAGE_NAME}"
fi