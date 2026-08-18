.PHONY: build desktop test clean

build:
	npm ci --prefix ui
	rm -rf backend/internal/app/web/dist/assets backend/internal/app/web/dist/index.html
	npm run build --prefix ui -- --outDir ../backend/internal/app/web/dist
	mkdir -p dist
	cd backend && go build -trimpath -ldflags="-s -w" -o ../dist/krio-chat$$(test "$$(go env GOOS)" = windows && printf .exe) .

desktop: build
	npm ci --prefix electron
	npm run dist --prefix electron

test:
	cd backend && go test ./... && go vet ./...
	npm run build --prefix ui

clean:
	rm -rf dist electron/dist backend/internal/app/web/dist/assets backend/internal/app/web/dist/index.html ui/dist
