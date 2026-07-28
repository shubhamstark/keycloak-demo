// downstream.go is the service-to-service half of music-service.
//
// It shows the two ways one backend authenticates to another, side by side, so
// the difference is impossible to miss:
//
//   client credentials  -> "I am music-service."   (no user involved)
//   token exchange       -> "I am music-service,     (acts for the user)
//                            acting for user X."
//
// Both talk to Keycloak's token endpoint. Both end with a bearer call to
// recommendation-service. What differs is the grant and, therefore, who the
// resulting token's subject is.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type DownstreamConfig struct {
	Issuer            string
	TokenEndpoint     string
	ClientID          string
	ClientSecret      string
	RecommendationURL string
	RecommendationAud string
}

type Downstream struct {
	cfg    DownstreamConfig
	client *http.Client
}

func NewDownstream(cfg DownstreamConfig) *Downstream {
	return &Downstream{cfg: cfg, client: &http.Client{Timeout: 10 * time.Second}}
}

// Recommendations fetches from recommendation-service using the chosen pattern.
// It returns the parsed recommendations, a label for which auth pattern was
// used, and any error. userToken is the raw validated user access token; sub is
// the user's subject, used only for logging.
func (d *Downstream) Recommendations(ctx context.Context, mode, userToken, sub string) (any, string, error) {
	var (
		downstreamToken string
		used            string
		err             error
	)

	switch mode {
	case "token_exchange":
		downstreamToken, err = d.tokenExchange(ctx, userToken)
		used = "token_exchange (acts on behalf of the user)"
	default: // client_credentials is the default
		downstreamToken, err = d.clientCredentials(ctx)
		used = "client_credentials (music-service acts as itself)"
	}
	if err != nil {
		return nil, used, err
	}

	recs, err := d.callRecommendations(ctx, downstreamToken)
	if err != nil {
		return nil, used, err
	}
	return recs, used, nil
}

// clientCredentials performs the OAuth 2.0 client credentials grant.
//
// This is the machine-to-machine flow from the OAuth article: no user, no
// browser, no redirect. music-service presents its own client_id and
// client_secret and receives a token whose SUBJECT is music-service's service
// account. recommendation-service will see azp=music-service and a service
// account sub, not an end user.
func (d *Downstream) clientCredentials(ctx context.Context) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	// We ask for a token whose audience is the downstream service, so it will
	// pass recommendation-service's audience check.
	form.Set("audience", d.cfg.RecommendationAud)

	return d.postToken(ctx, form)
}

// tokenExchange performs RFC 8693 standard token exchange (Keycloak V2).
//
// Instead of acting as itself, music-service trades the USER's token for a new
// token targeted at recommendation-service. The resulting token's subject is
// still the original user, so recommendation-service knows which human this is
// ultimately for, while music-service is recorded as the authorized party.
//
// Standard Token Exchange V2 is enabled by default in Keycloak 26.2+.
func (d *Downstream) tokenExchange(ctx context.Context, userToken string) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange")
	form.Set("subject_token", userToken)
	form.Set("subject_token_type", "urn:ietf:params:oauth:token-type:access_token")
	// The audience we want the new token minted for.
	form.Set("audience", d.cfg.RecommendationAud)

	return d.postToken(ctx, form)
}

// postToken sends a form to Keycloak's token endpoint with this service's client
// credentials (HTTP Basic) and returns the access_token from the response. Both
// grants above authenticate the CLIENT the same way; only the grant body differs.
func (d *Downstream) postToken(ctx context.Context, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.cfg.TokenEndpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Client authentication: music-service proves it is itself. This is the
	// client_secret doing its one job (see the OAuth article).
	req.SetBasicAuth(d.cfg.ClientID, d.cfg.ClientSecret)

	resp, err := d.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var tr struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", fmt.Errorf("parsing token response: %w", err)
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("token response contained no access_token")
	}
	return tr.AccessToken, nil
}

// callRecommendations makes the actual downstream request with whichever token
// we obtained. From recommendation-service's side this is just a bearer call it
// will validate; it does not care how we got the token, only that it is valid
// and aud'd correctly.
func (d *Downstream) callRecommendations(ctx context.Context, token string) (any, error) {
	u := strings.TrimRight(d.cfg.RecommendationURL, "/") + "/recommendations"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("recommendation-service returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("parsing recommendation response: %w", err)
	}
	return parsed, nil
}
