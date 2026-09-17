(() => {
  "use strict";

  // Standalone port of Aura's animated photo path. The shader math and
  // runtime constants intentionally match Aura rather than merely resembling it.
  const canvas = document.getElementById("dither-background");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  const vertexSource = `#version 300 es
    precision mediump float;
    layout(location = 0) in vec4 a_position;
    void main() { gl_Position = a_position; }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;
    uniform float u_time;
    uniform bool u_halfWallpaper;
    uniform vec2 u_resolution;
    uniform float u_pixelRatio;
    uniform sampler2D u_image;
    uniform sampler2D u_blueNoise;
    uniform float u_imageAspectRatio;
    uniform vec2 u_noiseSeed;
    uniform vec2 u_noiseRotation;
    out vec4 fragColor;

    float getUvFrame(vec2 uv, vec2 pad) {
      float aa = 0.0001;
      float left = smoothstep(-pad.x, -pad.x + aa, uv.x);
      float right = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
      float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
      float top = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);
      return left * right * bottom * top;
    }

    vec2 getImageUV(vec2 uv) {
      vec2 imageBoxSize;
      imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
      imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
      vec2 imageBoxScale = u_resolution / imageBoxSize;
      vec2 imageUV = uv * imageBoxScale;
      imageUV += 0.5;
      imageUV.y = 1.0 - imageUV.y;
      return imageUV;
    }

    void main() {
      // Keep the photograph continuous and quantize only the tone. Previously
      // the whole canvas was enlarged from a 40% buffer, which made the image
      // look low-resolution before the dither was even applied.
      vec2 centeredPixel = gl_FragCoord.xy - 0.5 * u_resolution;
      vec2 normalizedUV = centeredPixel / u_resolution;
      vec2 imageUV = getImageUV(normalizedUV);
      vec4 image = texture(u_image, imageUV);
      float frame = getUvFrame(imageUV, 1.5 / u_resolution);
      float lum = dot(vec3(0.2126, 0.7152, 0.0722), image.rgb);

      float auraWaveX = sin(u_time * 1.4 + normalizedUV.x * 12.0 + sin(normalizedUV.y * 9.0));
      float auraWaveY = sin(u_time * 1.1 - normalizedUV.y * 10.0 + sin(normalizedUV.x * 7.0));
      float auraWave = (auraWaveX + auraWaveY * 0.45) * 0.07;

      // Keep the original softly interpolated noise motion independent of the
      // sharper photograph underneath it.
      float grainSize = max(1.0, 2.0 * u_pixelRatio);
      vec2 grainPixel = centeredPixel / grainSize;
      vec2 auraWarp = vec2(auraWaveX, auraWaveY) * 2.5;
      vec2 noiseUV = (grainPixel + auraWarp + u_noiseSeed * 64.0) / 64.0;
      mat2 noiseRotation = mat2(
        u_noiseRotation.x, -u_noiseRotation.y,
        u_noiseRotation.y, u_noiseRotation.x
      );
      float noiseA = texture(u_blueNoise, noiseUV).r;
      float noiseB = texture(
        u_blueNoise,
        noiseRotation * noiseUV * 0.63 + u_noiseSeed.yx * 3.7
      ).r;
      float scaleField = 0.5 + 0.5 * sin(
        normalizedUV.x * 5.2 +
        sin(normalizedUV.y * 4.1 + u_noiseSeed.y * 6.2831853)
      );
      scaleField = smoothstep(0.12, 0.88, scaleField);
      float noiseMix = mix(0.08, 0.34, scaleField);
      float dithering = clamp((mix(noiseA, noiseB, noiseMix) - 0.5) * 1.16 + 0.5, 0.0, 1.0);

      float colorSteps = 7.0;
      dithering -= 0.5;
      float brightness = clamp(lum + dithering / colorSteps * 0.82 + auraWave, 0.0, 1.0);
      brightness = mix(0.0, brightness, frame);
      brightness = mix(0.0, brightness, image.a);
      float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;
      quantLum = mix(0.0, quantLum, frame);
      vec3 normColor = image.rgb / max(lum, 0.001);
      vec3 color = normColor * mix(brightness, quantLum, 0.82);

      // Two broad, slowly drifting light fields add atmosphere for roughly the
      // cost of a few dot products. No blur pass, extra texture, or DOM layer.
      vec2 fieldUV = normalizedUV + 0.5;
      vec2 lightA = vec2(
        0.27 + sin(u_time * 0.11) * 0.07,
        0.70 + cos(u_time * 0.09) * 0.05
      );
      vec2 lightB = vec2(
        0.76 + cos(u_time * 0.08) * 0.06,
        0.42 + sin(u_time * 0.07) * 0.07
      );
      float glowA = exp(-dot(fieldUV - lightA, fieldUV - lightA) * 4.2);
      float glowB = exp(-dot(fieldUV - lightB, fieldUV - lightB) * 5.5);
      color *= 0.88 + glowA * 0.17 + glowB * 0.10;
      color += vec3(0.025, 0.035, 0.065) * glowA * (0.3 + brightness);
      color += vec3(0.055, 0.025, 0.018) * glowB * (0.2 + brightness) * 0.45;

      vec2 vignetteUV = fieldUV * (1.0 - fieldUV.yx);
      float vignette = pow(clamp(vignetteUV.x * vignetteUV.y * 18.0, 0.0, 1.0), 0.22);
      color *= mix(0.58, 1.0, vignette);
      float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
      float opacity = mix(quantLum, 1.0, quantAlpha);

      if (u_halfWallpaper) {
        float auraFadeField = normalizedUV.y + auraWave * 1.8;
        float auraFade = smoothstep(-0.10, 0.22, auraFadeField);
        float auraDissolve = smoothstep(dithering + 0.38, dithering + 0.62, auraFade);
        color *= auraDissolve;
        opacity *= auraDissolve;

        // Let occasional grains catch light at the translucent boundary. The
        // edge mask peaks halfway through the dissolve and disappears on both
        // fully solid and fully transparent areas.
        float dissolveEdge = 4.0 * auraDissolve * (1.0 - auraDissolve);
        float edgeGrain = smoothstep(0.56, 0.90, noiseB);
        vec3 coolRim = vec3(0.18, 0.28, 0.48);
        vec3 warmRim = vec3(0.46, 0.24, 0.16);
        vec3 rimColor = mix(coolRim, warmRim, u_noiseSeed.x * 0.32);
        color += rimColor * dissolveEdge * edgeGrain * auraDissolve * 0.16;
      }
      fragColor = vec4(color, opacity);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Shader compilation failed");
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.useProgram(program);

  const positions = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uniforms = Object.fromEntries([
    "u_time", "u_halfWallpaper", "u_resolution", "u_pixelRatio",
    "u_image", "u_blueNoise", "u_imageAspectRatio", "u_noiseSeed",
    "u_noiseRotation",
  ].map((name) => [name, gl.getUniformLocation(program, name)]));

  const createBlueNoise = () => {
    const size = 64;
    const count = size * size;
    const white = new Float32Array(count);
    let state = 0x9e3779b9;
    for (let index = 0; index < count; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      white[index] = (state >>> 0) / 0x100000000;
    }
    const kernel = [1, 4, 6, 4, 1];
    const ranked = Array.from({ length: count }, (_, index) => {
      const x = index % size;
      const y = Math.floor(index / size);
      let blurred = 0;
      let weight = 0;
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const sx = (x + ox + size) % size;
          const sy = (y + oy + size) % size;
          const sampleWeight = kernel[ox + 2] * kernel[oy + 2];
          blurred += white[sy * size + sx] * sampleWeight;
          weight += sampleWeight;
        }
      }
      return { index, score: white[index] - blurred / weight };
    });
    ranked.sort((left, right) => left.score - right.score || left.index - right.index);
    const result = new Uint8Array(count);
    ranked.forEach((entry, rank) => {
      result[entry.index] = Math.floor(rank * 256 / count);
    });
    return result;
  };

  const blueNoiseTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, blueNoiseTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, createBlueNoise());
  gl.uniform1i(uniforms.u_blueNoise, 1);

  const imageTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.uniform1i(uniforms.u_image, 0);
  gl.uniform1i(uniforms.u_halfWallpaper, 1);

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let imageAspectRatio = 1;
  let noiseSeed = [Math.random(), Math.random()];
  let noiseRotation = [1, 0];
  let hasImage = false;
  let frameRequest = 0;
  let lastRender = null;
  let shaderClock = 40000;
  let disposed = false;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    // A ~1.45 MP ceiling is sharp at desktop sizes while remaining comfortably
    // below a native Retina framebuffer. Animation is still capped at 15 fps.
    const pixelBudget = 1450000;
    const scale = Math.min(1, Math.sqrt(pixelBudget / Math.max(1, rect.width * rect.height)));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    return rect.width || 1;
  };

  const draw = (timeMs = shaderClock) => {
    const cssWidth = resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!hasImage) return;
    gl.useProgram(program);
    gl.uniform1f(uniforms.u_time, timeMs * 0.001);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_pixelRatio, canvas.width / cssWidth);
    gl.uniform1f(uniforms.u_imageAspectRatio, imageAspectRatio);
    gl.uniform2f(uniforms.u_noiseSeed, noiseSeed[0], noiseSeed[1]);
    gl.uniform2f(uniforms.u_noiseRotation, noiseRotation[0], noiseRotation[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const animate = (now) => {
    if (disposed || document.hidden) return;
    if (lastRender === null || now - lastRender >= 1000 / 15) {
      if (lastRender !== null) shaderClock += Math.min(now - lastRender, 1000 / 15) * 0.5;
      lastRender = now;
      draw(reducedMotion.matches ? 40000 : shaderClock);
    }
    if (!reducedMotion.matches) frameRequest = requestAnimationFrame(animate);
  };

  const restart = () => {
    cancelAnimationFrame(frameRequest);
    if (document.hidden || disposed) return;
    lastRender = null;
    frameRequest = requestAnimationFrame(animate);
  };

  const setImage = (url) => new Promise((resolve, reject) => {
    if (!url) {
      hasImage = false;
      imageAspectRatio = 1;
      document.documentElement.dataset.wallpaper = "generated";
      draw();
      resolve();
      return;
    }
    const image = new Image();
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      imageAspectRatio = image.naturalWidth / image.naturalHeight;
      noiseSeed = [Math.random(), Math.random()];
      const noiseAngle = noiseSeed[0] * Math.PI * 2;
      noiseRotation = [Math.cos(noiseAngle), Math.sin(noiseAngle)];
      hasImage = true;
      document.documentElement.dataset.wallpaper = "loaded";
      draw();
      resolve();
    };
    image.onerror = (error) => {
      document.documentElement.dataset.wallpaper = "error";
      reject(error);
    };
    image.src = url;
  });

  document.addEventListener("visibilitychange", restart);
  window.addEventListener("resize", restart, { passive: true });
  reducedMotion.addEventListener("change", restart);
  window.addEventListener("pagehide", () => {
    disposed = true;
    cancelAnimationFrame(frameRequest);
    gl.deleteBuffer(positions);
    gl.deleteTexture(imageTexture);
    gl.deleteTexture(blueNoiseTexture);
    gl.deleteProgram(program);
  }, { once: true });

  window.heliumDither = { setImage };
  restart();
})();
