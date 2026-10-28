# Deploy Guimarães Aranha

Base: LibreChat **v0.8.8** (tag upstream). Customizações ficam só em:
- `Dockerfile`: bloco "Guimarães Aranha: cores da marca" (build args `REACT_APP_THEME_*`).
- `deploy/coolify-compose.yml`: stack do Coolify (api + mongodb + meilisearch + vectordb + rag_api).
- `deploy/librechat.yaml`: configuração (montada via `CONFIG_PATH`).

## Atualizar a partir do upstream
```bash
git remote add upstream https://github.com/LibreChat-AI/LibreChat.git   # uma vez
git fetch upstream tag v0.8.9 --no-tags
git checkout -b update/v0.8.9 && git merge v0.8.9   # resolver conflito só no Dockerfile, se houver
git push -u origin update/v0.8.9   # abrir PR e testar antes do merge
```
Repositório privado (não é fork: fork de repo público não pode ser privado); o vínculo com o upstream é pelo remote `upstream`.

## Variáveis no Coolify
Geradas automaticamente: `SERVICE_*` (Mongo sem porta exposta, Meili, JWT, CREDS, Postgres).
Pendentes (preencher em Environment Variables): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (RAG usa a chave OpenAI para embeddings).
Cadastro público desativado (`ALLOW_REGISTRATION=false`). Usuários: `npm run create-user` no container `api`.
