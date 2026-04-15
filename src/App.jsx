import React, { Suspense, useMemo, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { 
  Environment, 
  ContactShadows, 
  useGLTF, 
  OrbitControls,
  Html,
  useProgress,
  Line
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

function DiameterDimension({ box }) {
  const size = box.getSize(new THREE.Vector3())
  const boxCenter = box.getCenter(new THREE.Vector3())

  const modelRadius = Math.max(size.x, size.z) / 2
  const pad = modelRadius * 0.18
  const outerRadius = modelRadius + pad

  const cx = boxCenter.x
  const cz = boxCenter.z
  const cyCircle = boxCenter.y + size.y * 0.5 + 0.008

  // Outer dashed circle points
  const circlePoints = useMemo(() => {
    const segments = 96
    const pts = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push(new THREE.Vector3(
        cx + Math.cos(angle) * outerRadius,
        cyCircle,
        cz + Math.sin(angle) * outerRadius
      ))
    }
    return pts
  }, [cx, cz, cyCircle, outerRadius])

  // Arrow sizing
  const arrowRad    = outerRadius * 0.028
  const arrowHeight = outerRadius * 0.09

  // Two tick marks on the circle rim at left (180°) and right (0°)
  // pointing inward to show the diameter span
  const rimLeft  = new THREE.Vector3(cx - outerRadius, cyCircle, cz)
  const rimRight = new THREE.Vector3(cx + outerRadius, cyCircle, cz)

  // Short inward tick lines at each rim point
  const tickLen = outerRadius * 0.12
  const tickLeftA  = new THREE.Vector3(cx - outerRadius,            cyCircle, cz)
  const tickLeftB  = new THREE.Vector3(cx - outerRadius + tickLen,  cyCircle, cz)
  const tickRightA = new THREE.Vector3(cx + outerRadius,            cyCircle, cz)
  const tickRightB = new THREE.Vector3(cx + outerRadius - tickLen,  cyCircle, cz)

  // Leader line: starts at the right rim, extends further right, then label
  const leaderStart = new THREE.Vector3(cx + outerRadius,                        cyCircle, cz)
  const leaderEnd   = new THREE.Vector3(cx + outerRadius + outerRadius * 0.55,   cyCircle, cz)

  return (
    <group>
      {/* Dashed circle — outside the model perimeter */}
      <Line
        points={circlePoints}
        color="#1760a5"
        lineWidth={1.6}
        dashed
        dashSize={outerRadius * 0.06}
        gapSize={outerRadius * 0.04}
      />

      {/* Inward tick/arrow at LEFT rim */}
      <Line points={[tickLeftA, tickLeftB]} color="#1760a5" lineWidth={2} />
      <mesh position={rimLeft} rotation={[0, 0, -Math.PI / 2]}>
        <mesh position={[0, arrowHeight / 2, 0]}>
          <coneGeometry args={[arrowRad, arrowHeight, 16]} />
          <meshBasicMaterial color="#1760a5" />
        </mesh>
      </mesh>

      {/* Inward tick/arrow at RIGHT rim */}
      <Line points={[tickRightA, tickRightB]} color="#1760a5" lineWidth={2} />
      <mesh position={rimRight} rotation={[0, 0, Math.PI / 2]}>
        <mesh position={[0, arrowHeight / 2, 0]}>
          <coneGeometry args={[arrowRad, arrowHeight, 16]} />
          <meshBasicMaterial color="#1760a5" />
        </mesh>
      </mesh>

      {/* Leader line extending outward to the label */}
      <Line points={[leaderStart, leaderEnd]} color="#1760a5" lineWidth={1.8} />

      {/* Label at the end of the leader, fully outside the model */}
      <Html
        position={[leaderEnd.x + outerRadius * 0.04, leaderEnd.y, leaderEnd.z]}
        center={false}
        zIndexRange={[100, 0]}
        style={{ transform: 'translateY(-50%)' }}
      >
        <div className="dimension-label">⌀ 12″ (30 cm)</div>
      </Html>
    </group>
  )
}

function Model({ url, ...props }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef()
  const { box, center } = useMemo(() => {
    const clonedScene = scene.clone()
    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = box.getCenter(new THREE.Vector3())
    return { box, center }
  }, [scene])

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
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={scene} />
          <DiameterDimension box={box} />
        </group>
      </group>
    </group>
  )
}

// --- MAIN APP COMPONENT ---

export default function App() {
  const modelUrl = '/Cutting board.glb'
  const arViewerRef = useRef(null)
  const [showQR, setShowQR] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

  const handleARClick = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (!isMobile) { setShowQR(true); return }
    if (arViewerRef.current) arViewerRef.current.activateAR()
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
        <span>Kitchen Accessories</span><span>/</span>
        <span>Preparation Tools</span><span>/</span>
        <span>Solid Wood Cutting Board</span>
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
          <Canvas shadows camera={{ position: [0, 5.5, 0.5], fov: 38 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
            <color attach="background" args={['#f9f9f9']} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-3, 2, -2]} intensity={0.3} color="#ffeedd" />
            <Suspense fallback={<Loader />}>
              <Model url={modelUrl} scale={4.55} position={[0, -0.2, 0]} />
              <ContactShadows position={[0, -0.6, 0]} opacity={0.15} scale={10} blur={2.5} far={4} color="#000" />
              <Environment preset="apartment" environmentIntensity={0.6} />
            </Suspense>
            <OrbitControls
              makeDefault
              enablePan={false}
              minDistance={3}
              maxDistance={9}
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
          <div className="brand-series">BOSCH WOODEN</div>
          <h1>Solid Oak Cutting Board, Natural</h1>
          <div className="product-desc">Round 30 cm (12″) · Solid Oak</div>

          <div className="price-container">
            <span className="price-currency">Rs.</span>2,499
          </div>
          <div className="price-sub">Price incl. of all taxes</div>

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
          A clean expression that fits right in, in the kitchen or wherever you place it.
          Smooth-finish solid oak crafted with a focus on durability. Ideal for chopping,
          serving, and adding a touch of natural elegance to your culinary workspace.
        </p>
      </div>

      {/* AR QR Modal */}
      {showQR && (
        <div className="qr-overlay" onClick={() => setShowQR(false)}>
          <div className="qr-card" onClick={e => e.stopPropagation()}>
            <h2>Scan for AR</h2>
            <p>Open your camera and scan the code to place this board on your kitchen counter!</p>
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

      {/* Hidden AR engine */}
      <model-viewer ref={arViewerRef} src={modelUrl} ar ar-scale="fixed" ar-modes="scene-viewer webxr quick-look" style={{ display: 'none' }} />
    </div>
  )
}

useGLTF.preload('/Cutting board.glb')
