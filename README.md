# QuickReport

A weather reporting application that helps generate location-based weather report tweets for National Weather Service offices.

## Features

- Generate preview tweets with location and NWS office handles
- Reverse geocoding using OpenStreetMap Nominatim
- Automatic NWS office detection based on coordinates
- React frontend with Vite
- Express.js backend API

## Prerequisites

- Node.js (v20 or higher)
- npm

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/caden602/WxReport.git
   cd WxReport
   ```

2. Install all dependencies:
   ```bash
   npm run install:all
   ```

   This installs dependencies for both the server and client.

## Development

To run both the frontend and backend in development mode:

```bash
npm run dev
```

This will start:
- **Frontend** (React/Vite): http://localhost:5174 (or 5173 if available)
- **Backend** (Express.js): http://localhost:3001

The frontend proxies API requests to the backend automatically.

### Individual Services

You can also run services individually:

**Backend only:**
```bash
npm run dev:server
# or
cd server && npm run dev
```

**Frontend only:**
```bash
npm run dev:client
# or
cd client && npm run dev
```

## Production Build

### Build the Client
```bash
npm run build:client
```

### Package the Server
The server can be packaged as standalone executables:

```bash
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux

# All platforms
npm run package:all
```

Packaged executables will be in `server/dist/`.

## API

The backend provides the following endpoints:

- `GET /` - Health check
- `POST /api/preview` - Generate tweet preview

### Preview Endpoint

**Request:**
```json
{
  "lat": 40.7128,
  "lon": -74.0060,
  "testMode": "false"
}
```

**Response:**
```json
{
  "tweetText": "📍 New York, NY — @NWS — #wxreport",
  "location": "New York, NY",
  "officeHandle": "@NWS"
}
```

## Environment Variables

Create a `.env` file in the `server` directory:

```
PORT=3001
CLIENT_URL=http://localhost:5174
```

## Project Structure

```
WxReport/
├── client/          # React frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── server/          # Express.js backend
│   ├── index.js
│   ├── nwsOffices.js
│   ├── package.json
│   └── dist/        # Built executables
├── lib/             # Shared utilities
└── package.json     # Root scripts
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `npm run dev`
5. Submit a pull request

## License

[Add license information here]</content>
<parameter name="filePath">/Users/cadenmcvey/Documents/Projects/WxReport/README.md