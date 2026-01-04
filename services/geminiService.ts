
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  GoogleGenAI,
  Video,
  VideoGenerationReferenceImage,
  VideoGenerationReferenceType,
} from '@google/genai';
import {GenerateVideoParams, GenerationMode} from '../types';

export const generateVideo = async (
  params: GenerateVideoParams,
): Promise<{objectUrl: string; blob: Blob; uri: string; video: Video}> => {
  console.log('Starting video generation with params:', params);

  // Directly initialize SDK with the environment variable as required.
  // We do not check for existence here to let the SDK throw its native error 
  // which App.tsx is configured to catch and handle.
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

  const config: any = {
    numberOfVideos: 1,
    resolution: params.resolution,
  };

  if (params.mode !== GenerationMode.EXTEND_VIDEO) {
    config.aspectRatio = params.aspectRatio;
  }

  const generateVideoPayload: any = {
    model: params.model,
    config: config,
  };

  let finalPrompt = params.prompt || "";

  // Handle Social Promo Mode
  if (params.mode === GenerationMode.SOCIAL_PROMO) {
    const pText = params.promoText || "INGRESSO PROMOCIONAL R$50";
    const pPrice = params.promoPrice || "EQUIPE CERTA";
    const pPercent = params.promoPercent || 94;
    
    finalPrompt = `Cinematic high-impact social media promo video. 
    Use the provided poster as the background and visual base. 
    In the empty area at the bottom, animate a bold, high-contrast blinking text that says "${pText}". 
    Below it, add the subtitle "${pPrice}". 
    Animate a sleek, modern glowing progress bar filled to exactly ${pPercent}%, with the text "ESGOTANDO UM LOADING ${pPercent}%" next to it. 
    The style should be vibrant and professional with cinematic lighting effects. 
    Make the text effects high-energy. ${params.prompt ? " Additional details: " + params.prompt : ""}`;

    if (params.startFrame) {
        generateVideoPayload.image = {
          imageBytes: params.startFrame.base64,
          mimeType: params.startFrame.file.type,
        };
      }
  }

  if (finalPrompt) {
    generateVideoPayload.prompt = finalPrompt;
  }

  if (params.mode === GenerationMode.FRAMES_TO_VIDEO) {
    if (params.startFrame) {
      generateVideoPayload.image = {
        imageBytes: params.startFrame.base64,
        mimeType: params.startFrame.file.type,
      };
    }

    const finalEndFrame = params.isLooping
      ? params.startFrame
      : params.endFrame;
    if (finalEndFrame) {
      generateVideoPayload.config.lastFrame = {
        imageBytes: finalEndFrame.base64,
        mimeType: finalEndFrame.file.type,
      };
    }
  } else if (params.mode === GenerationMode.REFERENCES_TO_VIDEO) {
    const referenceImagesPayload: VideoGenerationReferenceImage[] = [];

    if (params.referenceImages) {
      for (const img of params.referenceImages) {
        referenceImagesPayload.push({
          image: {
            imageBytes: img.base64,
            mimeType: img.file.type,
          },
          referenceType: VideoGenerationReferenceType.ASSET,
        });
      }
    }

    if (referenceImagesPayload.length > 0) {
      generateVideoPayload.config.referenceImages = referenceImagesPayload;
    }
  } else if (params.mode === GenerationMode.EXTEND_VIDEO) {
    if (params.inputVideoObject) {
      generateVideoPayload.video = params.inputVideoObject;
    } else {
      throw new Error('An input video object is required to extend a video.');
    }
  }

  console.log('Submitting video generation request...', generateVideoPayload);
  let operation = await ai.models.generateVideos(generateVideoPayload);

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  if (operation?.response) {
    const videos = operation.response.generatedVideos;
    if (!videos || videos.length === 0) throw new Error('No videos generated.');

    const firstVideo = videos[0];
    const videoObject = firstVideo.video;
    const url = decodeURIComponent(videoObject.uri);
    
    // Always append the current API key when fetching from the download link.
    const res = await fetch(`${url}&key=${process.env.API_KEY}`);
    if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);

    const videoBlob = await res.blob();
    const objectUrl = URL.createObjectURL(videoBlob);

    return {objectUrl, blob: videoBlob, uri: url, video: videoObject};
  } else {
    throw new Error('No videos generated.');
  }
};
