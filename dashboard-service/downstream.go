// downstream.go handles service-to-service calls from dashboard-service.
//
// It demonstrates token exchange (RFC 8693): exchanging the user's access
// token for one targeted at admin-service, so the downstream call preserves
// the user's identity and organization. This is the "carry the user and
// tenant forward" pattern from keycloak-mapped.md, lines 447-454.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

type DownstreamConfig struct {
	TokenEndpoint string // Keycloak token endpoint
	ClientID      string // this service's client ID
	ClientSecret  string // this service's client secret
	AdminURL      string // admin-service base URL
	AdminAudience string // audience for admin-service tokens
}

func DownstreamConfigFromEnv() DownstreamConfig {
	return DownstreamConfig{
		TokenEndpoint: os.Getenv("OIDC_TOKEN_ENDPOINT"),
		ClientID:      os.Getenv("CLIENT_ID"),
		ClientSecret:  os.Getenv("CLIENT_SECRET"),
		AdminURL:      os.Getenv("ADMIN_SERVICE_URL"),
		AdminAudience: os.Getenv("ADMIN_AUDIENCE"),
	}
}

// exchangeToken performs a standard token exchange (RFC 8693).
// It trades the user's access token for one targeting admin-service.
// The returned token has the same sub (user) but new aud (admin-service)
// and azp (dashboard-service). See AUTH-FLOWS.md Flow 3.
func exchangeToken(cfg DownstreamConfig, userToken string) (string, error) {
	form := url.Values{
		"grant_type":           {"urn:ietf:params:oauth:grant-type:token-exchange"},
		"subject_token":        {userToken},
		"subject_token_type":   {"urn:ietf:params:oauth:token-type:access_token"},
		"audience":             {cfg.AdminAudience},
		"client_id":            {cfg.ClientID},
		"client_secret":        {cfg.ClientSecret},
	}

	req, err := http.NewRequest("POST", cfg.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("building token exchange request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token exchange call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("token exchange returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding token exchange response: %w", err)
	}

	return result.AccessToken, nil
}

// callAdminService calls admin-service with the given bearer token.
func callAdminService(adminURL, token, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", adminURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("building admin request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("admin service call failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("reading admin response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("admin service returned %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
