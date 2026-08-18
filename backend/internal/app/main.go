package app

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"krio-chat/backend/internal/app/license"
)

func Run() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	whatsApp, err := newWhatsApp(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer whatsApp.close()

	server := &server{wa: whatsApp, checker: license.DefaultChecker()}
	whatsApp.connectAll()
	whatsApp.startStatusScheduler()
	if key := setting(whatsApp.db, "license_key"); key != "" {
		license, licenseErr := server.checker.Check(ctx, key)
		if licenseErr != nil {
			log.Printf("lisans doğrulanamadı: %v", licenseErr)
		} else {
			server.setLicense(license)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	httpServer := &http.Server{Handler: server.routes()}
	network, err := newNetworkController(httpServer, port, setting(whatsApp.db, "network_access") == "1")
	if err != nil {
		log.Fatal(err)
	}
	server.network = network
	defer network.close()
	go func() {
		<-ctx.Done()
		_ = httpServer.Shutdown(context.Background())
	}()

	log.Printf("Krio Connect listening on :%s", port)
	<-ctx.Done()
}
