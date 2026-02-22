import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Globe, Mail, Lock, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';

const Settings = () => {
    const [connections, setConnections] = useState({
        google: { status: 'not_connected', email: null },
        ubersuggest: { status: 'not_connected', expiresAt: null },
        mrm: { status: 'not_connected', expiresAt: null }
    });

    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/sessions/status', {
                headers: { 'Authorization': `Bearer ${token}` }, // Keep bearer for now but transition to cookie
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                const newConnections = { ...connections };
                data.forEach(sess => {
                    if (newConnections[sess.service]) {
                        newConnections[sess.service].status = 'connected';
                        newConnections[sess.service].createdAt = sess.created_at;
                    }
                });
                setConnections(newConnections);
            }
        } catch (err) {
            console.error('Failed to fetch session status', err);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);



    const connectService = async (service) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/sessions/connect/${service}`, {
                method: 'POST',
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                fetchStatus();
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert('Erreur lors de la connexion au service');
        } finally {
            setLoading(false);
        }
    };

    const ConnectionCard = ({ title, icon: Icon, service, data }) => (
        <div className="glass rounded-xl p-6 border border-white/5 hover:border-blue-500/30 transition-all group">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600/10 rounded-lg flex items-center justify-center border border-blue-500/20">
                        <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">{title}</h3>
                        <p className="text-xs text-slate-400 capitalize">{service}</p>
                    </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${data.status === 'connected' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                    data.status === 'expired' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                    {data.status === 'connected' && <CheckCircle2 className="w-3 h-3" />}
                    {data.status === 'expired' && <AlertCircle className="w-3 h-3" />}
                    {data.status.replace('_', ' ')}
                </div>
            </div>

            <div className="space-y-4">
                {data.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Mail className="w-4 h-4 text-slate-500" />
                        <span>{data.email}</span>
                    </div>
                )}

                {data.expiresAt && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                        <RefreshCw className="w-4 h-4 text-slate-500" />
                        <span>Expire le {new Date(data.expiresAt).toLocaleDateString()}</span>
                    </div>
                )}

                <button
                    onClick={() => connectService(service)}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${data.status === 'connected'
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                        }`}
                >
                    {data.status === 'connected' ? 'Reconnecter' : 'Connecter'}
                    <ExternalLink className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                    <SettingsIcon className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Paramètres des services</h1>
                    <p className="text-slate-400">Connectez vos comptes tiers pour automatiser les audits</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ConnectionCard
                    title="Google"
                    icon={Globe}
                    service="google"
                    data={connections.google}
                />
                <ConnectionCard
                    title="Ubersuggest"
                    icon={Lock}
                    service="ubersuggest"
                    data={connections.ubersuggest}
                />
                <ConnectionCard
                    title="My Ranking Metrics"
                    icon={Lock}
                    service="mrm"
                    data={connections.mrm}
                />
            </div>

            <div className="glass rounded-2xl p-6 border border-white/5 bg-blue-900/5">
                <div className="flex gap-4">
                    <div className="w-12 h-12 bg-blue-600/10 rounded-full flex items-center justify-center shrink-0">
                        <AlertCircle className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-semibold text-white">Pourquoi connecter ces services ?</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Le robot Smart Audit utilise vos propres sessions pour récupérer les données d'autorité et les rapports techniques.
                            Vos mots de passe ne sont **jamais stockés**. Nous capturons uniquement les jetons de session (cookies)
                            qui sont ensuite chiffrés de manière sécurisée (AES-256) sur notre serveur.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
