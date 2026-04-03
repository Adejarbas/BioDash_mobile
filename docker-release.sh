#!/usr/bin/env bash
set -euo pipefail

# Exemplos de uso:
#   ./docker-release.sh 0.8.1 --push
#   ./docker-release.sh --auto patch --push
#
# Resultado esperado:
#   - Git tag: v0.8.1
#   - Docker tags: 0.8.1 e latest

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
  --no-git-sync                Nao cria/sincroniza tag Git automaticamente
  --image NAMESPACE/REPO       Define nome da imagem
  -h, --help                   Mostra esta ajuda
EOF
}

IMAGE_NAME="thiagohmn93/biodash_mobile"
VERSION=""
PUSH_FLAG=""
AUTO_BUMP=""
GIT_SYNC="true"

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
    --no-git-sync)
      GIT_SYNC="false"
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

sync_git_version() {
  if [[ "${GIT_SYNC}" != "true" ]]; then
    return 0
  fi

  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Repositorio Git nao detectado. Pulando sincronizacao de tag Git."
    return 0
  fi

  local tag_name="v${VERSION}"

  if [[ -n "${AUTO_BUMP}" ]]; then
    git add package.json package-lock.json
    if ! git diff --cached --quiet; then
      git commit -m "chore(release): version ${VERSION}"
    fi
  fi

  if git rev-parse "${tag_name}" >/dev/null 2>&1; then
    echo "Tag Git ${tag_name} ja existe."
  else
    git tag "${tag_name}"
    echo "Tag Git criada: ${tag_name}"
  fi

  if [[ "${PUSH_FLAG}" == "--push" ]]; then
    if [[ -n "${AUTO_BUMP}" ]]; then
      local current_branch
      current_branch="$(git branch --show-current || true)"
      if [[ -n "${current_branch}" ]]; then
        git push origin "${current_branch}"
        echo "Branch enviada: ${current_branch}"
      fi
    fi

    git push origin "${tag_name}"
    echo "Tag Git enviada: ${tag_name}"
  fi
}

sync_git_version

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