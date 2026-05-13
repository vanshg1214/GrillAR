import React, { Suspense, useMemo, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  Environment, 
  ContactShadows, 
  useGLTF, 
  OrbitControls,
  Html,
  useProgress,
  Center,
  Line,
  useAnimations
} from '@react-three/drei'
import * as THREE from 'three'

// --- 3D COMPONENTS ---

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="loader-container">
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'}}>
          <div className="loader"></div>
          <div style={{color: '#1760a5', fontSize: '0.8rem', fontWeight: 600}}>
            {progress.toFixed(0)}%
          </div>
        </div>
      </div>
    </Html>
  )
}

function RectangularDimension({ box }) {
  const size = box.getSize(new THREE.Vector3())
  const boxCenter = box.getCenter(new THREE.Vector3())

  // Width (X) and Depth (Z) dimensions
  const width = size.x
  const depth = size.z

  // Ground level or slightly above the bounding box
  const cy = boxCenter.y - size.y / 2 + 0.05
  const cx = boxCenter.x
  const cz = boxCenter.z

  // Margins for lines so they sit outside the model
  const marginOffset = Math.max(width, depth) * 0.15

  // Points for Width (front)
  const zFront = cz + depth / 2 + marginOffset
  const xLeft = cx - width / 2
  const xRight = cx + width / 2

  // Points for Depth (side)
  const xSide = cx + width / 2 + marginOffset
  const zBack = cz - depth / 2
  const zFrontEdge = cz + depth / 2

  return (
    <group>
      {/* Front width line */}
      <Line points={[[xLeft, cy, zFront], [xRight, cy, zFront]]} color="#d32f2f" lineWidth={2} />
      {/* Small ticks for front width */}
      <Line points={[[xLeft, cy, zFront - 0.05], [xLeft, cy, zFront + 0.05]]} color="#d32f2f" lineWidth={2} />
      <Line points={[[xRight, cy, zFront - 0.05], [xRight, cy, zFront + 0.05]]} color="#d32f2f" lineWidth={2} />
      
      <Html position={[cx, cy, zFront + 0.08]} center className="dimension-label">
        {(width * 100).toFixed(1)} cm
      </Html>

      {/* Side depth line */}
      <Line points={[[xSide, cy, zBack], [xSide, cy, zFrontEdge]]} color="#d32f2f" lineWidth={2} />
      {/* Small ticks for side depth */}
      <Line points={[[xSide - 0.05, cy, zBack], [xSide + 0.05, cy, zBack]]} color="#d32f2f" lineWidth={2} />
      <Line points={[[xSide - 0.05, cy, zFrontEdge], [xSide + 0.05, cy, zFrontEdge]]} color="#d32f2f" lineWidth={2} />

      <Html position={[xSide + 0.08, cy, cz]} center className="dimension-label">
        {(depth * 100).toFixed(1)} cm
      </Html>
    </group>
  )
}

function Model({ url, onCentered, playAnimation, ...props }) {
  const { scene, animations } = useGLTF(url)
  const groupRef = useRef()
  const { actions, names } = useAnimations(animations, scene)
  const isOpenRef = useRef(false) // Initially Closed (frame 0 = closed now)

  // Initially stop all animations at frame 0 (closed state)
  useEffect(() => {
    if (names.length > 0) {
      console.log(`Animations found: ${names.length}`, names)
      names.forEach(name => {
        const action = actions[name]
        if (action) {
          action.reset().play()
          action.paused = true
          action.time = 0
        }
      })
    }
  }, [actions, names])

  useEffect(() => {
    if (playAnimation > 0 && names.length > 0) {
      const currentlyOpen = isOpenRef.current
      
      names.forEach(name => {
        const action = actions[name]
        if (action) {
          action.paused = false
          action.setLoop(THREE.LoopOnce)
          action.clampWhenFinished = true
          
          if (currentlyOpen) {
            // Open -> Close: Play backward (from end back to 0)
            action.setEffectiveTimeScale(-1)
            action.paused = false
            action.play()
          } else {
            // Closed -> Open: Play forward (from 0 to end)
            action.setEffectiveTimeScale(1)
            action.reset().play()
          }
        }
      })
      isOpenRef.current = !currentlyOpen
    }
  }, [playAnimation, actions, names])

  const { box, center, size } = useMemo(() => {
    const clonedScene = scene.clone()
    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    return { box, center, size }
  }, [scene])

  // Report the bounding info upward once computed
  useEffect(() => {
    if (onCentered) onCentered({ center, size })
  }, [center, size, onCentered])

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.scale.x = THREE.MathUtils.lerp(groupRef.current.scale.x, 1, 0.05)
      groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, 1, 0.05)
      groupRef.current.scale.z = THREE.MathUtils.lerp(groupRef.current.scale.z, 1, 0.05)
    }
  })

  return (
    <group {...props}>
      <group ref={groupRef} scale={[0, 0, 0]}>
        {/* Offset so the geometric center of the model sits at (0,0,0) */}
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={scene} />
          {!props.hideDimensions && <RectangularDimension box={box} />}
        </group>
      </group>
    </group>
  )
}

// --- MAIN APP COMPONENT ---

function MainView() {
  const modelUrl = '/grill_fixed_v6.glb'
  const arViewerRef = useRef(null)
  const [showQR, setShowQR] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [playAnimation, setPlayAnimation] = useState(0)

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  // AR Animation Loop Logic
  useEffect(() => {
    const viewer = arViewerRef.current
    if (!viewer) return
    let loopTimeout

    // Full cycle: wait -> open (forward play) -> wait -> close (reverse via currentTime) -> repeat
    const playCycle = () => {
      // Play forward: closed -> open
      viewer.currentTime = 0
      viewer.play()
      const dur = viewer.duration || 2

      // After the open animation finishes, wait 3s then close
      setTimeout(() => {
        viewer.pause()
        // Wait 3s with grill open, then smoothly close
        loopTimeout = setTimeout(() => {
          // Reverse: smoothly go from open (end) back to closed (0)
          const startTime = performance.now()
          const startCT = viewer.duration
          const animDur = viewer.duration || 2

          const step = (now) => {
            const elapsed = (now - startTime) / 1000
            const progress = Math.min(elapsed / animDur, 1)
            viewer.currentTime = startCT * (1 - progress)
            if (progress < 1) {
              requestAnimationFrame(step)
            } else {
              viewer.currentTime = 0
              viewer.pause()
              // Wait 2s then repeat
              loopTimeout = setTimeout(playCycle, 2000)
            }
          }
          requestAnimationFrame(step)
        }, 3000)
      }, dur * 1000)
    }

    // On load: ensure we start at frame 0 (closed)
    viewer.addEventListener('load', () => {
      const animations = viewer.availableAnimations
      if (animations && animations.length > 0) {
        viewer.animationName = animations[0]
        viewer.currentTime = 0
        viewer.pause()
      }
    })

    // On AR session: wait 2s then begin loop
    viewer.addEventListener('ar-status', (e) => {
      if (e.detail.status === 'session-started') {
        loopTimeout = setTimeout(playCycle, 2000)
      } else if (e.detail.status === 'not-presenting') {
        clearTimeout(loopTimeout)
      }
    })

    return () => {
      clearTimeout(loopTimeout)
    }
  }, [])

  const handleARClick = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    
    if (!isMobile) { 
      setShowQR(true)
      return 
    }
    
    if (arViewerRef.current) {
      arViewerRef.current.activateAR()
    }
  }

  return (
    <div className="app-container">

      {/* Header */}
      <header className="header">
        <div className="ikea-logo">BOSCH</div>
        <div className="search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <span>What are you looking for?</span>
        </div>
        <div className="nav-icons">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
            <path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
      </header>

      {/* Breadcrumbs */}
      <nav className="breadcrumbs">
        <span>Products</span><span>/</span>
        <span>Outdoor Living</span><span>/</span>
        <span>Gas Grills</span><span>/</span>
        <span>American Outdoor Grill</span>
      </nav>

      <main className="product-layout">

        {/* Thumbnails */}
        <aside className="thumbnail-list">
          <div className="thumb-item active">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888">
              <rect x="2" y="2" width="20" height="20" rx="2"/>
              <path d="M7 11c0-1.1.9-2 2-2h6a2 2 0 0 1 2 2v6H7v-6Z"/>
            </svg>
          </div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="thumb-item">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
              </svg>
            </div>
          ))}
        </aside>

        {/* 3D Viewer */}
        <section className="viewer-container">
          <Canvas shadows camera={{ position: [0, 1, 2], fov: 40 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
            <color attach="background" args={['#f5f5f5']} />
            <ambientLight intensity={0.2} />
            
            {/* Key light for specular highlights on metal */}
            <directionalLight position={[5, 10, 3]} intensity={0.8} castShadow shadow-mapSize={[2048, 2048]} />
            {/* Soft fill light */}
            <directionalLight position={[-5, 5, -5]} intensity={0.3} color="#e0e0e0" />

            <Suspense fallback={<Loader />}>
              {/* Model sits at origin (0,0,0) — no position offset */}
              <Model url={modelUrl} hideDimensions={showQR} playAnimation={playAnimation} />
              <ContactShadows position={[0, -0.5, 0]} opacity={0.4} scale={20} blur={1.5} far={4} color="#000" />
              
              {/* Cedar Bridge Sunset HDR for premium reflections */}
              <Environment files="/cedar_bridge_sunset_1_4k.hdr" environmentIntensity={1.8} />
            </Suspense>
            <OrbitControls
              makeDefault
              target={[0, 0, 0]}
              enablePan={false}
              minDistance={0.2}
              maxDistance={20}
            />
          </Canvas>

          <div className="viewer-actions">
            <button className="action-pill">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M15 2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2zM0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2z"/>
                <path d="M5 4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zM5 7a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 5 7zm0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
              </svg>
              All media
            </button>
            <button className="action-pill" onClick={() => setPlayAnimation(prev => prev + 1)}>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
              </svg>
              Play Animation
            </button>
            <button className="action-pill" onClick={handleARClick}>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M0 1.5A1.5 1.5 0 0 1 1.5 0h2A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-2A1.5 1.5 0 0 1 0 2.5v-1zm11 0A1.5 1.5 0 0 1 12.5 0h2A1.5 1.5 0 0 1 16 1.5v1A1.5 1.5 0 0 1 14.5 4h-2A1.5 1.5 0 0 1 11 2.5v-1zm-11 11A1.5 1.5 0 0 1 1.5 11h2A1.5 1.5 0 0 1 5 12.5v1A1.5 1.5 0 0 1 3.5 16h-2A1.5 1.5 0 0 1 0 14.5v-1zm11 0A1.5 1.5 0 0 1 12.5 11h2a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5v-1z"/>
              </svg>
              View in AR
            </button>
          </div>
        </section>

        {/* Product Info */}
        <section className="product-info-panel">
          <div className="brand-series">PREMIUM OUTDOOR</div>
          <h1>American Outdoor Grill, Stainless Steel</h1>
          <div className="product-desc">Built-in Premium Gas Grill · High Performance</div>

          <div className="price-container">
            <span className="price-currency">$</span>2,499.00
          </div>
          <div className="price-sub">Includes standard shipping</div>

          <div className="rating-row">
            <div className="rating-stars">★★★★★</div>
            <span className="rating-link">(154 reviews)</span>
          </div>

          <div className="options-box">
            <div className="option-row">
              <span className="option-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Delivery
              </span>
              <span className="option-link">Check availability</span>
            </div>
            <div className="option-row">
              <span className="option-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6h18ZM3 10v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10M12 10v12"/>
                </svg>
                At store
              </span>
              <span className="option-link">Check nearest store</span>
            </div>
          </div>

          <button className="add-to-cart">Add to bag</button>
        </section>

      </main>

      {/* Product Details */}
      <div className="footer-desc">
        <h3>Product details</h3>
        <p>
          Bring the ultimate outdoor cooking experience to your backyard. 
          Crafted from heavy-duty 304 stainless steel with advanced burner technology, 
          this grill delivers high performance and durability for years of family barbecues.
        </p>
      </div>

      {/* AR QR Modal */}
      {showQR && (
        <div className="qr-overlay" onClick={() => setShowQR(false)}>
          <div className="qr-card" onClick={e => e.stopPropagation()}>
            <h2>Scan for AR</h2>
            <p>Open your camera and scan the code to place this grill in your backyard!</p>
            <div className="qr-image-wrap">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(currentUrl)}`}
                alt="QR Code"
                width="200"
                height="200"
                style={{ borderRadius: '8px' }}
              />
            </div>
            <button className="add-to-cart" onClick={() => setShowQR(false)}>Got it</button>
          </div>
        </div>
      )}

      {/* AR engine — rendered off-screen so it loads properly */}
      <model-viewer
        ref={arViewerRef}
        src={modelUrl}
        ar
        ar-scale="fixed"
        ar-modes="scene-viewer quick-look"
        animation-name="gasmate outdoor kitchen022|Take 001|BaseLayer"
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
    </div>
  )
}

function EmbedView() {
  const modelUrl = '/grill_fixed_v6.glb'
  const arViewerRef = useRef(null)
  const [showQR, setShowQR] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [playAnimation, setPlayAnimation] = useState(0)

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  useEffect(() => {
    const viewer = arViewerRef.current
    if (!viewer) return
    let loopTimeout

    const playCycle = () => {
      viewer.currentTime = 0
      viewer.play()
      const dur = viewer.duration || 2

      setTimeout(() => {
        viewer.pause()
        loopTimeout = setTimeout(() => {
          const startTime = performance.now()
          const startCT = viewer.duration
          const animDur = viewer.duration || 2

          const step = (now) => {
            const elapsed = (now - startTime) / 1000
            const progress = Math.min(elapsed / animDur, 1)
            viewer.currentTime = startCT * (1 - progress)
            if (progress < 1) {
              requestAnimationFrame(step)
            } else {
              viewer.currentTime = 0
              viewer.pause()
              loopTimeout = setTimeout(playCycle, 2000)
            }
          }
          requestAnimationFrame(step)
        }, 3000)
      }, dur * 1000)
    }

    viewer.addEventListener('load', () => {
      const animations = viewer.availableAnimations
      if (animations && animations.length > 0) {
        viewer.animationName = animations[0]
        viewer.currentTime = 0
        viewer.pause()
      }
    })

    viewer.addEventListener('ar-status', (e) => {
      if (e.detail.status === 'session-started') {
        loopTimeout = setTimeout(playCycle, 2000)
      } else if (e.detail.status === 'not-presenting') {
        clearTimeout(loopTimeout)
      }
    })

    return () => {
      clearTimeout(loopTimeout)
    }
  }, [])

  const handleARClick = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    
    if (!isMobile) { 
      setShowQR(true)
      return 
    }
    
    if (arViewerRef.current) {
      arViewerRef.current.activateAR()
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      <Canvas shadows camera={{ position: [0, 1, 2], fov: 40 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}>
        <color attach="background" args={['#f5f5f5']} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 10, 3]} intensity={0.8} castShadow shadow-mapSize={[2048, 2048]} />
        <directionalLight position={[-5, 5, -5]} intensity={0.3} color="#e0e0e0" />

        <Suspense fallback={<Loader />}>
          <Model url={modelUrl} hideDimensions={showQR} playAnimation={playAnimation} />
          <ContactShadows position={[0, -0.5, 0]} opacity={0.4} scale={20} blur={1.5} far={4} color="#000" />
          <Environment files="/cedar_bridge_sunset_1_4k.hdr" environmentIntensity={1.8} />
        </Suspense>
        <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={0.2} maxDistance={20} />
      </Canvas>

      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 10
      }}>
        <button onClick={() => setPlayAnimation(prev => prev + 1)} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#fff',
          color: '#000',
          border: 'none',
          borderRadius: '30px',
          fontWeight: '600',
          fontSize: '14px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          cursor: 'pointer'
        }}>
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
            <path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
          </svg>
          Play Animation
        </button>
        
        <button onClick={handleARClick} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '30px',
          fontWeight: '600',
          fontSize: '14px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          cursor: 'pointer'
        }}>
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
            <path d="M0 1.5A1.5 1.5 0 0 1 1.5 0h2A1.5 1.5 0 0 1 5 1.5v1A1.5 1.5 0 0 1 3.5 4h-2A1.5 1.5 0 0 1 0 2.5v-1zm11 0A1.5 1.5 0 0 1 12.5 0h2A1.5 1.5 0 0 1 16 1.5v1A1.5 1.5 0 0 1 14.5 4h-2A1.5 1.5 0 0 1 11 2.5v-1zm-11 11A1.5 1.5 0 0 1 1.5 11h2A1.5 1.5 0 0 1 5 12.5v1A1.5 1.5 0 0 1 3.5 16h-2A1.5 1.5 0 0 1 0 14.5v-1zm11 0A1.5 1.5 0 0 1 12.5 11h2a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5v-1z"/>
          </svg>
          View in AR
        </button>
      </div>

      {showQR && (
        <div className="qr-overlay" onClick={() => setShowQR(false)}>
          <div className="qr-card" onClick={e => e.stopPropagation()}>
            <h2>Scan for AR</h2>
            <p>Open your camera and scan the code to place this grill in your backyard!</p>
            <div className="qr-image-wrap">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(currentUrl)}`}
                alt="QR Code"
                width="200"
                height="200"
                style={{ borderRadius: '8px' }}
              />
            </div>
            <button className="add-to-cart" onClick={() => setShowQR(false)}>Got it</button>
          </div>
        </div>
      )}

      <model-viewer
        ref={arViewerRef}
        src={modelUrl}
        ar
        ar-scale="fixed"
        ar-modes="scene-viewer quick-look"
        animation-name="gasmate outdoor kitchen022|Take 001|BaseLayer"
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (path === '/embed') {
    return <EmbedView />
  }

  return <MainView />
}

useGLTF.preload('/grill_fixed_v6.glb')
