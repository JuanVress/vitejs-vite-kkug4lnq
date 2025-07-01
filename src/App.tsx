import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, deleteDoc, orderBy } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

// --- Importaciones de imágenes ---
// Asume que has subido 'logo.png' a la carpeta public/assets/
import logo from '/assets/logo.png'; // Ruta relativa desde la raíz pública
// La importación de 'chibi' ha sido eliminada.


// --- INTERFACES PARA TIPADO ESTRICTO ---
interface HistoryItem {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp?: any;
}

declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
        adsbygoogle: any[]; // <--- ¡AÑADIDO: Tipado para la variable global de AdSense!
    }
}

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyAdO3WZpgy2jZZ3PMkgjp1qPLMxRVmUbS8",
    authDomain: "linguovega.firebaseapp.com",
    projectId: "linguovega",
    storageBucket: "linguovega.firebasestorage.app",
    messagingSenderId: "483280601320",
    appId: "1:483280601320:web:8d1163c098da6edb1b095d",
    measurementId: "G-P33LD8FMG6"
};

const appId = "linguo-app-produccion";

// --- COMPONENTE PRINCIPAL ---
const App = () => {
    // --- ESTADOS CON TIPOS EXPLÍCITOS ---
    const [inputText, setInputText] = useState<string>('');
    const [translatedText, setTranslatedText] = useState<string>('');
    const [sourceLanguage, setSourceLanguage] = useState<string>('es');
    const [targetLanguage, setTargetLanguage] = useState<string>('en');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const recognition = useRef<any>(null);
    const [db, setDb] = useState<Firestore | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
    const [translationHistory, setTranslationHistory] = useState<HistoryItem[]>([]);

    const languages = [
        { code: 'en', name: 'Inglés' }, { code: 'es', name: 'Español' }, { code: 'fr', name: 'Francés' },
        { code: 'de', name: 'Alemán' }, { code: 'it', name: 'Italiano' }, { code: 'pt', name: 'Portugués' },
        { code: 'zh', name: 'Chino' }, { code: 'ja', name: 'Japonés' }, { code: 'ko', name: 'Coreano' },
        { code: 'ar', name: 'Árabe' }, { code: 'ru', name: 'Ruso' },
    ];

    // --- EFECTOS (LÓGICA DE INICIALIZACIÓN) ---
    useEffect(() => {
        try {
            const app: FirebaseApp = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            const auth: Auth = getAuth(app);
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    await signInAnonymously(auth).catch(console.error);
                }
                setIsAuthReady(true);
            });
        } catch (err) {
            console.error("Error initializing Firebase:", err);
            setError("Error al inicializar Firebase.");
        }
    }, []);

    useEffect(() => {
        const loadVoices = () => {
            if (typeof window.speechSynthesis !== 'undefined') {
                setVoices(window.speechSynthesis.getVoices());
            }
        };
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = loadVoices;
            loadVoices();
        }
        return () => {
            if (typeof window.speechSynthesis !== 'undefined') {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);
    
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognitionInstance = new SpeechRecognition();
            recognitionInstance.continuous = false;
            recognitionInstance.interimResults = false;
            recognitionInstance.lang = sourceLanguage;
            recognitionInstance.onstart = () => setIsListening(true);
            recognitionInstance.onend = () => setIsListening(false);
            recognitionInstance.onresult = (event: any) => setInputText(event.results[0][0].transcript);
            recognitionInstance.onerror = (event: any) => setError(`Error de voz: ${event.error}.`);
            recognition.current = recognitionInstance;
        }
    }, [sourceLanguage]);
    
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;
        const historyRef = collection(db, `artifacts/${appId}/users/${userId}/translationHistory`);
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTranslationHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as HistoryItem)));
        }, (_err) => { // Se usa _err para indicar que no se usa y evitar el error
            setError("Error al cargar el historial.");
        });
        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    // **INICIO: Nuevo useEffect para cargar AdSense **
    useEffect(() => {
        const loadGoogleAds = () => {
            if (window.adsbygoogle && typeof window.adsbygoogle.push === 'function') {
                try {
                    (window.adsbygoogle as any[]).push({});
                    console.log("AdSense push triggered successfully."); // Para depuración
                } catch (e) {
                    console.error("Error al ejecutar adsbygoogle.push:", e);
                }
            } else {
                console.warn("window.adsbygoogle no está disponible. Reintentando en 500ms...");
                setTimeout(loadGoogleAds, 500); 
            }
        };

        loadGoogleAds(); 
    }, []); 
    // **FIN: Nuevo useEffect para cargar AdSense **

    // --- FUNCIONES ---
    const handleTranslate = async () => {
        if (!inputText.trim()) return setError('Por favor, ingresa texto para traducir.');
        setIsLoading(true);
        setError('');
        setTranslatedText('');

        try {
            const apiKey = "AIzaSyC4mPun5tdNyxhh8Be3vcLi0SgRc4c3oJE";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
            const sourceLangName = languages.find(l => l.code === sourceLanguage)?.name;
            const targetLangName = languages.find(l => l.code === targetLanguage)?.name;
            const prompt = `Traduce de ${sourceLangName} a ${targetLangName}. Responde únicamente con la traducción directa, sin añadir ninguna palabra, explicación o contexto adicional. Texto a traducir: "${inputText}"`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };

            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Error en la respuesta de la API');
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (text) {
                setTranslatedText(text);
                if (db && userId) {
                    await addDoc(collection(db, `artifacts/${appId}/users/${userId}/translationHistory`), {
                        originalText: inputText, translatedText: text, sourceLang: sourceLanguage,
                        targetLang: targetLanguage, timestamp: serverTimestamp(),
                    });
                }
            } else {
                 throw new Error('No se pudo obtener una traducción de la respuesta de la API.');
            }
        } catch (err: unknown) { // Se especifica el tipo 'unknown'
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Error al traducir:', err);
            setError(`Error de traducción: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSpeak = () => {
        if (!translatedText || !window.speechSynthesis) return;
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        
        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(translatedText);
        utterance.lang = targetLanguage;
        const foundVoice = voices.find(v => v.lang.startsWith(targetLanguage));
        utterance.voice = foundVoice || null; // Se maneja el caso de undefined
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => {
            setError('Error al reproducir el audio.');
            setIsSpeaking(false);
        };
        window.speechSynthesis.speak(utterance);
    };
    
    const handleSpeechInput = () => {
        if (!recognition.current) return setError('El reconocimiento de voz no está disponible.');
        if (isListening) {
            recognition.current.stop();
        } else {
            recognition.current.start();
        }
    };

    const handleDeleteHistoryItem = async (itemId: string) => {
        if (!db || !userId) return;
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/translationHistory`, itemId));
        } catch (err) { setError("Error al eliminar la traducción."); }
    };

    const loadHistoryItem = (item: HistoryItem) => {
        setInputText(item.originalText);
        setTranslatedText(item.translatedText);
        setSourceLanguage(item.sourceLang);
        setTargetLanguage(item.targetLang);
        setError('');
    };

    // --- RENDERIZADO DE LA INTERFAZ ---
    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-[#e6d5c1] font-sans text-[#785d56]">
            <style>{`@font-face{font-family:'Fragmentcore';src:url('/fonts/Fragmentcore.otf') format('opentype');} body{font-family:'Fragmentcore',sans-serif;} .custom-scrollbar::-webkit-scrollbar{width:8px;} .custom-scrollbar::-webkit-scrollbar-track{background:#f1f1f1;border-radius:10px;} .custom-scrollbar::-webkit-scrollbar-thumb{background:#c6b299;border-radius:10px;} .custom-scrollbar::-webkit-scrollbar-thumb:hover{background:#be4c54;}`}</style>
            
            <aside className="w-full md:w-1/4 bg-[#fff4e3] p-4 md:p-6 shadow-lg flex flex-col rounded-b-2xl md:rounded-r-2xl md:rounded-bl-none overflow-hidden">
                <h2 className="text-2xl font-bold mb-4 text-[#785d56]">Historial</h2>
                <div className="flex-grow overflow-y-auto custom-scrollbar">
                    {!isAuthReady ? (<p className="text-gray-500 text-center mt-4">Cargando...</p>) : 
                    translationHistory.length > 0 ? (
                        <ul className="space-y-3">
                            {translationHistory.map((item: HistoryItem) => (
                                <li key={item.id} onClick={() => loadHistoryItem(item)} className="relative bg-[#e6d5c1] p-3 rounded-lg shadow-sm cursor-pointer hover:bg-[#c6b299] transition-all">
                                    <p className="font-semibold text-sm text-[#785d56] pr-6 truncate">{item.originalText}</p>
                                    <p className="text-xs text-[#be4c54] truncate pr-6">{item.translatedText}</p>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteHistoryItem(item.id); }} className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center" aria-label="Eliminar">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : ( <p className="text-gray-500 text-center mt-4">No hay historial.</p> )}
                </div>
            </aside>

            <main className="flex-1 p-4 md:p-8 flex flex-col justify-center">
                <div className="bg-[#fff4e3] p-6 md:p-8 rounded-2xl shadow-xl w-full max-w-4xl mx-auto space-y-6">
                    {/* **INICIO: Sección de Logo ** */}
                    {/* El logo ahora está posicionado absolutamente para estar en el centro superior y sobre otras capas */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 mt-4 z-50"> 
                        <img src={logo} alt="Logo de Linguo Traductor" className="h-20 md:h-110" />
                    </div>
                    {/* **FIN: Sección de Logo ** */}

                    {/* El resto del contenido principal se mantiene. Un margen superior para no chocar con el logo. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-20 md:mt-24"> {/* Ajusta el mt-valor si el logo se superpone */}
                        <div>
                            <label htmlFor="source-lang" className="text-lg font-semibold text-[#785d56]">Idioma de Origen:</label>
                            <select id="source-lang" value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)} className="w-full mt-2 p-3 border border-[#c6b299] rounded-lg focus:ring-2 focus:ring-[#be4c54] transition bg-[#e6d5c1] text-[#785d56] cursor-pointer">
                                {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                            </select>
                            <div className="relative mt-4">
                                <textarea className="w-full h-40 p-4 border border-[#c6b299] rounded-lg focus:ring-2 focus:ring-[#be4c54] resize-none bg-[#fff4e3] text-[#785d56] placeholder-[#785d56]/70 pr-10" placeholder="Escribe o dicta el texto aquí..." value={inputText} onChange={(e) => setInputText(e.target.value)}></textarea>
                                <button onClick={handleSpeechInput} disabled={!recognition.current || isListening} className={`absolute top-3 right-3 p-2 rounded-full shadow-md transition-all ${!recognition.current || isListening ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#be4c54] text-white hover:bg-[#a83b42]'}`} aria-label={isListening ? "Detener dictado" : "Iniciar dictado"}>
                                    {isListening ? <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM9 9h6v6H9z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.2-3c0 3-2.54 5.1-5.2 5.1S6.8 14 6.8 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.8z"/></svg>}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label htmlFor="target-lang" className="text-lg font-semibold text-[#785d56]">Idioma de Destino:</label>
                            <select id="target-lang" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)} className="w-full mt-2 p-3 border border-[#c6b299] rounded-lg focus:ring-2 focus:ring-[#be4c54] transition bg-[#e6d5c1] text-[#785d56] cursor-pointer">
                                {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                            </select>
                            <div className="relative mt-4">
                                <div className="w-full h-40 p-4 border border-[#c6b299] rounded-lg bg-[#e6d5c1] text-[#785d56] overflow-y-auto pr-10">
                                    {translatedText || <span className="text-[#785d56]/70">La traducción aparecerá aquí...</span>}
                                </div>
                                <button onClick={handleSpeak} disabled={!translatedText || isSpeaking} className={`absolute top-3 right-3 p-2 rounded-full shadow-md transition-all ${!translatedText || isSpeaking ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#be4c54] text-white hover:bg-[#a83b42]'}`} aria-label={isSpeaking ? "Detener audio" : "Reproducir traducción"}>
                                    {isSpeaking ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.98 7-4.66 7-8.77s-2.99-7.79-7-8.77z"/></svg>}
                                </button>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleTranslate} disabled={isLoading || !inputText.trim() || !isAuthReady} className={`w-full py-3 px-6 rounded-xl text-white font-bold text-lg shadow-md transition-all ${isLoading || !inputText.trim() || !isAuthReady ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#be4c54] hover:bg-[#a83b42] transform hover:scale-105 active:scale-95'}`}>
                        {isLoading ? (<div className="flex items-center justify-center"><svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Traduciendo...</div>) : ('Traducir')}
                    </button>
                    {error && (<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl relative mt-4" role="alert"><strong className="font-bold">¡Error!</strong><span className="block sm:inline"> {error}</span></div>)}
                </div>

                {/* **INICIO: Sección para la Publicidad ** */}
                <div className="ad-container mt-8 p-4 bg-[#fff4e3] rounded-xl shadow-md w-full max-w-4xl mx-auto text-center">
                    {/* Aquí se cargará el anuncio de AdSense */}
                    <ins className="adsbygoogle"
                         style={{ display: 'block', width: '100%', height: 'auto', minHeight: '90px' }} 
                         data-ad-client="pub-3121401058916322" // ¡ID de Editor YA REEMPLAZADO!
                         data-ad-slot="4072799267"       // ¡ID de Slot YA REEMPLAZADO!
                         data-ad-format="auto"
                         data-full-width-responsive="true"></ins>
                </div>
                {/* **FIN: Sección para la Publicidad ** */}

            </main>
        </div>
    );
};

export default App;