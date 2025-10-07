const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

const API_KEY = process.env.RAPIDAPI_KEY; 
const API_HOST = 'api-football-v1.p.rapidapi.com';

app.use(cors());

// --- ESTADO DEL SERVIDOR ---
let serverState = {
    status: 'loading',
    message: 'El servidor está iniciando y cargando la base de datos de la NFL. Este proceso puede tardar varios minutos la primera vez.',
    DB: {
        teams: [],
        players: {}
    }
};

async function loadAndProcessData() {
    if (!API_KEY) {
        console.error("FATAL: La RAPIDAPI_KEY no está configurada en las variables de entorno.");
        serverState.status = 'error';
        serverState.message = 'Error de configuración del servidor: falta la API Key.';
        return;
    }
    console.log("Iniciando carga de datos de la NFL desde API-Football...");
    try {
        const teamsResponse = await fetch('https://api-football-v1.p.rapidapi.com/teams?league=1&season=2023', {
            headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST }
        });
        const teamsData = await teamsResponse.json();
        const nflTeams = teamsData.response.filter(t => t.team.country === 'USA');

        serverState.DB.teams = nflTeams.map(t => ({ id: t.team.id, name: t.team.name, logo: t.team.logo })).sort((a,b) => a.name.localeCompare(b.name));
        
        for (const team of nflTeams) {
            console.log(`Obteniendo jugadores para ${team.team.name}...`);
            const playersResponse = await fetch(`https://api-football-v1.p.rapidapi.com/players?team=${team.team.id}&season=2023`, {
                headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST }
            });
            const playersData = await playersResponse.json();

            playersData.response.forEach(playerData => {
                // ... (lógica de procesamiento de jugadores sin cambios)
                const player = playerData.player; const stats = playerData.statistics[0]; const position = stats.games.position; if (['Quarterback', 'Runningback', 'Wide Receiver', 'Tight End'].includes(position)) { const processedStats = {}; const games = stats.games.appearences || 16; if (stats.passing.yards) processedStats.passingYards = { displayName: 'Yardas por Pase', gameLog: generateGameLog(stats.passing.yards / games, 50, games), category: 'Pases' }; if (stats.passing.total) processedStats.completions = { displayName: 'Pases Completados', gameLog: generateGameLog(stats.passing.total / games, 5, games), category: 'Pases' }; if (stats.passing.td) processedStats.passingTDs = { displayName: 'TDs de Pase', gameLog: generateGameLog(stats.passing.td / games, 1, games), category: 'Pases' }; if (stats.passing.interceptions) processedStats.interceptions = { displayName: 'Intercepciones', gameLog: generateGameLog(stats.passing.interceptions / games, 0.5, games), category: 'Pases' }; if (stats.rushing.yards) processedStats.rushingYards = { displayName: 'Yardas por Carrera', gameLog: generateGameLog(stats.rushing.yards / games, 20, games), category: 'Carrera' }; if (stats.rushing.attempts) processedStats.rushingAttempts = { displayName: 'Acarreos', gameLog: generateGameLog(stats.rushing.attempts / games, 4, games), category: 'Carrera' }; if (stats.receiving.yards) processedStats.receivingYards = { displayName: 'Yardas por Recepción', gameLog: generateGameLog(stats.receiving.yards / games, 25, games), category: 'Recepción' }; if (stats.receiving.receptions) processedStats.receptions = { displayName: 'Recepciones', gameLog: generateGameLog(stats.receiving.receptions / games, 3, games), category: 'Recepción' }; if (stats.receiving.td) processedStats.receivingTDs = { displayName: 'TDs de Recepción', gameLog: generateGameLog(stats.receiving.td / games, 0.5, games), category: 'Recepción' }; if (Object.keys(processedStats).length > 0) { serverState.DB.players[player.id] = { id: player.id, name: player.name, position: position, headshot: player.photo, teamId: team.team.id, stats: processedStats }; } }
            });
        }
        
        serverState.status = 'ready';
        serverState.message = 'Datos cargados exitosamente.';
        console.log(`Base de datos de la NFL cargada. ${Object.keys(serverState.DB.players).length} jugadores procesados.`);

    } catch (error) {
        console.error("FALLO CRÍTICO al cargar la base de datos de la NFL:", error);
        serverState.status = 'error';
        serverState.message = 'No se pudieron cargar los datos desde la API externa.';
    }
}

const generateGameLog = (average, variance = 30, games = 16) => { const log = []; for (let i = 0; i < games; i++) { let val = average + (Math.random() - 0.5) * 2 * variance; if (variance <= 1.5) val = Math.round(val * 2) / 2; else val = Math.floor(val); log.push({ value: Math.max(0, val) }); } return log; };

// --- ENDPOINTS PARA EL FRONTEND ---

// NUEVO endpoint para consultar el estado
app.get('/api/status', (req, res) => {
    res.json({
        status: serverState.status,
        message: serverState.message
    });
});

app.get('/api/data', (req, res) => {
    if (serverState.status !== 'ready') {
        return res.status(503).json({ error: serverState.message });
    }
    res.json(serverState.DB);
});

// INICIA EL SERVIDOR INMEDIATAMENTE
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    // Y LUEGO CARGA LOS DATOS EN SEGUNDO PLANO
    loadAndProcessData();
});





