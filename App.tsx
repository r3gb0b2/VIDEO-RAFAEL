
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Video} from '@google/genai';
import React, {useCallback, useEffect, useState} from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import {CurvedArrowDownIcon} from './components/icons';
import LoadingIndicator from './components/LoadingIndicator';
import PromptForm from './components/PromptForm';
import VideoResult from './components/VideoResult';
import {generateVideo} from './services/geminiService';
import {
  AppState,
  GenerateVideoParams,
  GenerationMode,
  Resolution,
  VideoFile,
} from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<GenerateVideoParams | null>(
    null,
  );
  const [lastVideoObject, setLastVideoObject] = useState<Video | null>(null);
  const [lastVideoBlob, setLastVideoBlob] = useState<Blob | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [pendingParams, setPendingParams] = useState<GenerateVideoParams | null>(null);

  const [initialFormValues, setInitialFormValues] =
    useState<GenerateVideoParams | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        try {
          if (!(await window.aistudio.hasSelectedApiKey())) {
            setShowApiKeyDialog(true);
          }
        } catch (error) {
          console.warn('aistudio.hasSelectedApiKey check failed.', error);
          setShowApiKeyDialog(true);
        }
      }
    };
    checkApiKey();
  }, []);

  const showStatusError = (message: string) => {
    setErrorMessage(message);
    setAppState(AppState.ERROR);
  };

  const handleGenerate = useCallback(async (params: GenerateVideoParams, skipKeyCheck = false) => {
    // Before generating, check if a key has been selected, unless we just came from the selection dialog
    if (!skipKeyCheck && window.aistudio) {
      try {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          setPendingParams(params);
          setShowApiKeyDialog(true);
          return;
        }
      } catch (error) {
        console.warn('Key check failed, attempting generation anyway.', error);
      }
    }

    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLastConfig(params);
    setInitialFormValues(null);

    try {
      const {objectUrl, blob, video} = await generateVideo(params);
      setVideoUrl(objectUrl);
      setLastVideoBlob(blob);
      setLastVideoObject(video);
      setAppState(AppState.SUCCESS);
      setPendingParams(null);
    } catch (error) {
      console.error('Video generation failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred.';
      let userFriendlyMessage = `Video generation failed: ${errorMsg}`;
      let shouldOpenDialog = false;

      // Handle the specific "An API Key must be set" error which happens in browsers
      // when the process.env.API_KEY is falsy during SDK initialization.
      if (errorMsg.includes('An API Key must be set') || errorMsg.includes('API key is missing')) {
        if (skipKeyCheck) {
          // If we were trying to auto-generate after a key selection and it failed,
          // it's likely the race condition. Instead of showing an error, 
          // we silently return to IDLE so the user can just click "Generate" again.
          setAppState(AppState.IDLE);
          setInitialFormValues(params);
          return;
        }
        userFriendlyMessage = 'API Key missing. Please select a valid paid API key.';
        shouldOpenDialog = true;
      } else if (errorMsg.includes('Requested entity was not found.')) {
        userFriendlyMessage = 'Model or entity not found. Please ensure you have selected a valid, paid API key.';
        shouldOpenDialog = true;
      } else if (
        errorMsg.includes('API_KEY_INVALID') ||
        errorMsg.includes('API key not valid') ||
        errorMsg.toLowerCase().includes('permission denied') ||
        errorMsg.toLowerCase().includes('unauthenticated')
      ) {
        userFriendlyMessage = 'A valid, paid API key is required for Veo. Please select one from the dialog.';
        shouldOpenDialog = true;
      }

      setErrorMessage(userFriendlyMessage);
      setAppState(AppState.ERROR);

      if (shouldOpenDialog) {
        setPendingParams(params);
        setShowApiKeyDialog(true);
      }
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastConfig) {
      handleGenerate(lastConfig);
    }
  }, [lastConfig, handleGenerate]);

  const handleApiKeyDialogContinue = async () => {
    setShowApiKeyDialog(false);
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
    }
    
    // Mitigate race condition: Proceed immediately assuming selection was successful.
    // We attempt generation but handle the "missing key" error gracefully in handleGenerate.
    if (pendingParams) {
      handleGenerate(pendingParams, true);
    } else if (appState === AppState.ERROR && lastConfig) {
      handleGenerate(lastConfig, true);
    } else {
      // Just return to the app interface
      setAppState(AppState.IDLE);
    }
  };

  const handleNewVideo = useCallback(() => {
    setAppState(AppState.IDLE);
    setVideoUrl(null);
    setErrorMessage(null);
    setLastConfig(null);
    setLastVideoObject(null);
    setLastVideoBlob(null);
    setInitialFormValues(null);
    setPendingParams(null);
  }, []);

  const handleTryAgainFromError = useCallback(() => {
    if (lastConfig) {
      setInitialFormValues(lastConfig);
      setAppState(AppState.IDLE);
      setErrorMessage(null);
    } else {
      handleNewVideo();
    }
  }, [lastConfig, handleNewVideo]);

  const handleExtend = useCallback(async () => {
    if (lastConfig && lastVideoBlob && lastVideoObject) {
      try {
        const file = new File([lastVideoBlob], 'last_video.mp4', {
          type: lastVideoBlob.type,
        });
        const videoFile: VideoFile = {file, base64: ''};

        setInitialFormValues({
          ...lastConfig,
          mode: GenerationMode.EXTEND_VIDEO,
          prompt: '',
          inputVideo: videoFile,
          inputVideoObject: lastVideoObject,
          resolution: Resolution.P720,
          startFrame: null,
          endFrame: null,
          referenceImages: [],
          styleImage: null,
          isLooping: false,
        });

        setAppState(AppState.IDLE);
        setVideoUrl(null);
        setErrorMessage(null);
      } catch (error) {
        console.error('Failed to prepare video extension:', error);
        showStatusError(`Failed to prepare video for extension.`);
      }
    }
  }, [lastConfig, lastVideoBlob, lastVideoObject]);

  const renderError = (message: string) => (
    <div className="text-center bg-red-900/20 border border-red-500 p-8 rounded-lg max-w-lg shadow-xl backdrop-blur-sm">
      <h2 className="text-2xl font-bold text-red-400 mb-4">Generation Error</h2>
      <p className="text-red-300 mb-8 leading-relaxed">{message}</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={handleTryAgainFromError}
          className="px-6 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors font-medium">
          Adjust Settings
        </button>
        <button
          onClick={() => setShowApiKeyDialog(true)}
          className="px-6 py-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors font-medium">
          Switch API Key
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
      {showApiKeyDialog && (
        <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />
      )}
      <header className="py-6 flex justify-center items-center px-8 relative z-10">
        <h1 className="text-5xl font-semibold tracking-wide text-center bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          Veo Studio
        </h1>
      </header>
      <main className="w-full max-w-4xl mx-auto flex-grow flex flex-col p-4 relative">
        {appState === AppState.IDLE ? (
          <>
            <div className="flex-grow flex items-center justify-center">
              <div className="relative text-center">
                <h2 className="text-3xl text-gray-600 font-light">
                  Type in the prompt box to start
                </h2>
                <CurvedArrowDownIcon className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-24 h-24 text-gray-700 opacity-60 animate-bounce" />
              </div>
            </div>
            <div className="pb-4">
              <PromptForm
                onGenerate={handleGenerate}
                initialValues={initialFormValues}
              />
            </div>
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center overflow-y-auto px-4">
            {appState === AppState.LOADING && <LoadingIndicator />}
            {appState === AppState.SUCCESS && videoUrl && (
              <VideoResult
                videoUrl={videoUrl}
                onRetry={handleRetry}
                onNewVideo={handleNewVideo}
                onExtend={handleExtend}
                canExtend={lastConfig?.resolution === Resolution.P720}
              />
            )}
            {appState === AppState.SUCCESS && !videoUrl && renderError('Video generated, but could not be played.')}
            {appState === AppState.ERROR && errorMessage && renderError(errorMessage)}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
