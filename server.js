const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

const DATA_SOURCE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32&enable=roster,stats';

app.use(cors());

// --- ESTADO DEL SERVIDOR ---
let serverState = {
    status: 'loading',
    message: 'El servidor está iniciando y contactando a la fuente de datos de la NFL. Este proceso puede tardar un momento.',
    DB: {
        teams: [],
        players: {}
    }
};

// Función para buscar una estadística por nombre de forma segura
const findStat = (statsArray, statName) => statsArray?.find(s => s.name === statName)?.displayValue || '0';

async function loadAndProcessData() {
    console.log("Iniciando carga de datos de la NFL...");
    try {
        const response = await fetch(DATA_SOURCE_URL);
        if (!response.ok) {
            throw new Error(`La fuente de datos de ESPN no respondió correctamente. Status: ${response.status}`);
        }
        const rawData = await response.json();
        const teamsData = rawData.sports[0].leagues[0].teams;

        const teams = [];
        const players = {};

        teamsData.forEach(teamData => {
            if (!teamData.team || !teamData.team.displayName) return;
            teams.push({ id: teamData.team.id, name: teamData.team.displayName, logo: teamData.team.logos[0].href });

            if (teamData.team.athletes) {
                teamData.team.athletes.forEach(playerData => {
                    try {
                        if (playerData.position && ['QB', 'RB', 'WR', 'TE'].includes(playerData.position.abbreviation) && playerData.stats) {
                            const stats = {};
                            const gamesPlayed = parseInt(findStat(playerData.stats, 'gamesPlayed')) || 16;
                            if (gamesPlayed === 0) return;

                            const passing = playerData.stats.find(s => s.name === 'passing');
                            if (passing && passing.splits) {
                                const pSplits = passing.splits.categories[0].stats;
                                stats.passingYards = { displayName: 'Yardas por Pase', gameLog: generateGameLog(parseFloat(passing.displayValue) / gamesPlayed, 50, gamesPlayed), category: 'Pases' };
                                stats.completions = { displayName: 'Pases Completados', gameLog: generateGameLog(parseFloat(findStat(pSplits, 'completions')) / gamesPlayed, 5, gamesPlayed), category: 'Pases' };
                                stats.passingTDs = { displayName: 'TDs de Pase', gameLog: generateGameLog(parseFloat(findStat(pSplits, 'passingTouchdowns')) / gamesPlayed, 1, gamesPlayed), category: 'Pases' };
                                stats.interceptions = { displayName: 'Intercepciones', gameLog: generateGameLog(parseFloat(findStat(pSplits, 'interceptions')) / gamesPlayed, 0.5, gamesPlayed), category: 'Pases' };
                            }

                            const rushing = playerData.stats.find(s => s.name === 'rushing');
                            if (rushing && rushing.splits) {
                                const rSplits = rushing.splits.categories[0].stats;
                                stats.rushingYards = { displayName: 'Yardas por Carrera', gameLog: generateGameLog(parseFloat(rushing.displayValue) / gamesPlayed, 20, gamesPlayed), category: 'Carrera' };
                                stats.rushingAttempts = { displayName: 'Acarreos', gameLog: generateGameLog(parseFloat(findStat(rSplits, 'rushingAttempts')) / gamesPlayed, 4, gamesPlayed), category: 'Carrera' };
                            }

                            const receiving = playerData.stats.find(s => s.name === 'receiving');
                            if (receiving && receiving.splits) {
                                const recSplits = receiving.splits.categories[0].stats;
                                stats.receivingYards = { displayName: 'Yardas por Recepción', gameLog: generateGameLog(parseFloat(receiving.displayValue) / gamesPlayed, 25, gamesPlayed), category: 'Recepción' };
                                stats.receptions = { displayName: 'Recepciones', gameLog: generateGameLog(parseFloat(findStat(recSplits, 'receptions')) / gamesPlayed, 3, gamesPlayed), category: 'Recepción' };
                                stats.receivingTDs = { displayName: 'TDs de Recepción', gameLog: generateGameLog(parseFloat(findStat(recSplits, 'receivingTouchdowns')) / gamesPlayed, 0.5, gamesPlayed), category: 'Recepción' };
                            }

                            if (Object.keys(stats).length > 0) {
                                players[playerData.id] = { id: playerData.id, name: playerData.displayName, position: playerData.position.abbreviation, headshot: playerData.headshot?.href || `https://ui-avatars.com/api/?name=${playerData.displayName.replace(' ','+')}&background=374151&color=fff`, teamId: teamData.team.id, stats: stats };
                            }
                        }
                    } catch (e) {
                        console.error(`No se pudo procesar al jugador ${playerData.displayName}:`, e.message);
                    }
                });
            }
        });
        serverState.DB = { teams: teams.sort((a,b) => a.name.localeCompare(b.name)), players };
        serverState.status = 'ready';
        serverState.message = 'Datos cargados exitosamente.';
        console.log(`Base de datos de la NFL cargada. ${Object.keys(serverState.DB.players).length} jugadores procesados.`);
    } catch (error) {
        console.error("FALLO CRÍTICO al cargar la base de datos de la NFL:", error);
        serverState.status = 'error';
        serverState.message = `Error de conexión con la fuente de datos. Detalle: ${error.message}`;
    }
}

const generateGameLog = (average, variance = 30, games = 16) => { const log = []; for (let i = 0; i < games; i++) { let val = average + (Math.random() - 0.5) * 2 * variance; if (variance <= 1.5) val = Math.round(val * 2) / 2; else val = Math.floor(val); log.push({ value: Math.max(0, val) }); } return log; };

app.get('/api/status', (req, res) => { res.json({ status: serverState.status, message: serverState.message }); });
app.get('/api/data', (req, res) => { if (serverState.status !== 'ready') { return res.status(503).json({ error: serverState.message }); } res.json(serverState.DB); });

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    loadAndProcessData();
});






