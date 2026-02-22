import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, ChevronRight, Eye, EyeOff } from 'lucide-react';

export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isRegister && password !== confirmPassword) {
            alert('Les mots de passe ne correspondent pas');
            return;
        }

        const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });
            const data = await response.json();

            if (response.ok) {
                if (isRegister) {
                    alert('Compte créé ! Vous pouvez maintenant vous connecter.');
                    setIsRegister(false);
                    setPassword('');
                    setConfirmPassword('');
                } else {
                    onLogin(data.user);
                }
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert('Erreur de connexion au serveur');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px]" />
            </div>

            <div className="w-full max-w-md glass rounded-2xl p-8 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-600/20 rounded-xl flex items-center justify-center mb-4 border border-blue-500/30 group-hover:scale-110 transition-transform duration-500">
                        <ShieldCheck className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Smart Audit</h1>
                    <p className="text-slate-400 text-sm">
                        {isRegister ? 'Rejoignez la plateforme' : 'Connectez-vous pour gérer vos audits'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Email</label>
                        <div className="relative group/input">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/input:text-blue-400 transition-colors" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-white placeholder:text-slate-600"
                                placeholder="nom@exemple.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mot de passe</label>
                            {!isRegister && (
                                <a href="#" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Oublié ?</a>
                            )}
                        </div>
                        <div className="relative group/input">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/input:text-blue-400 transition-colors" />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-3 pl-11 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-white placeholder:text-slate-600"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {isRegister && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Confirmer le mot de passe</label>
                            <div className="relative group/input">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/input:text-blue-400 transition-colors" />
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-3 pl-11 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-white placeholder:text-slate-600"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}

                    <button type="submit" className="w-full btn-primary py-4 mt-4 flex items-center justify-center group/btn relative overflow-hidden">
                        <span className="relative z-10 flex items-center">
                            {isRegister ? "S'inscrire" : 'Se connecter'}
                            <ChevronRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                        </span>
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-sm">
                        {isRegister ? 'Déjà un compte ?' : 'Nouveau ici ?'}{' '}
                        <button
                            type="button"
                            onClick={() => {
                                console.log('Toggling isRegister to:', !isRegister);
                                setIsRegister(!isRegister);
                            }}
                            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                            {isRegister ? 'Se connecter' : 'Créer un compte'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

