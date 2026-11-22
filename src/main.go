package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	service, err := newWebsiteService()
	if err != nil {
		log.Fatal(err)
	}

	runContext, cancelServer := context.WithCancel(ctx)
	defer cancelServer()

	restart := startAutoUpdateWatcher(ctx, cancelServer)
	runErr := service.Run(runContext)
	if ctx.Err() != nil {
		return
	}
	if runErr != nil && runContext.Err() == nil {
		log.Fatal(runErr)
	}

	// The updater queues the replacement executable before cancelling the
	// server context, so it is ready to launch after Node and Nginx stop.
	if runContext.Err() != nil {
		select {
		case executable := <-restart:
			log.Printf("Restarting with the updated Zarad launcher")
			if err := startUpdatedExecutable(executable); err != nil {
				log.Printf("Could not relaunch the updated server: %v", err)
				log.Printf("The source checkout is updated; run the Zarad launcher again to start it")
			}
		default:
			if runErr != nil {
				log.Printf("Zarad stopped while an update was being prepared: %v", runErr)
			}
		}
	}
}
