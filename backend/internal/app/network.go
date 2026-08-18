package app

import (
	"errors"
	"net"
	"net/http"
	"strconv"
	"sync"
)

type networkController struct {
	mu       sync.Mutex
	server   *http.Server
	listener net.Listener
	port     string
	enabled  bool
}

func newNetworkController(server *http.Server, port string, enabled bool) (*networkController, error) {
	c := &networkController{server: server, port: port}
	if err := c.bind(enabled); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *networkController) address(enabled bool) string {
	host := "127.0.0.1"
	if enabled {
		host = "0.0.0.0"
	}
	return net.JoinHostPort(host, c.port)
}

func (c *networkController) bind(enabled bool) error {
	listener, err := net.Listen("tcp", c.address(enabled))
	if err != nil {
		return err
	}
	c.listener, c.enabled = listener, enabled
	go func() { _ = c.server.Serve(listener) }()
	return nil
}

func (c *networkController) set(enabled bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.enabled == enabled {
		return nil
	}
	if c.listener != nil {
		_ = c.listener.Close()
	}
	return c.bind(enabled)
}

func (c *networkController) close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.listener == nil {
		return nil
	}
	return c.listener.Close()
}

func (s *server) networkStatus() map[string]any {
	s.network.mu.Lock()
	defer s.network.mu.Unlock()
	return map[string]any{"enabled": s.network.enabled, "port": portNumber(s.network.port)}
}

func portNumber(value string) int { number, _ := strconv.Atoi(value); return number }

var errNetworkUnavailable = errors.New("ağ erişimi başlatılamadı")
