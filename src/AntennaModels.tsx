import React, { useRef } from "react";
import { TransformControls, Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";

// فرض بر این است که تایپ‌ها و کامپوننت AntennaModel از قبل تعریف شده‌اند
// این ساختار به گونه‌ای است که با سایر بخش‌های پروژه شما سازگار باشد

export const ManualAntennaGizmo = ({
  element,
  index,
  config,
  setConfig,
}: {
  element: any;
  index: number;
  config: any;
  setConfig: React.Dispatch<React.SetStateAction<any>>;
}) => {
  return (
    <TransformControls
      mode="translate"
      position={element.position}
      onObjectChange={(e: any) => {
        const { x, y, z } = e.target.object.position;
        // این بخش مختصات جدید را مستقیم به موتور فیزیکی می‌فرستد
        setConfig((prev: any) => {
          const updated = [...prev.manualElements];
          updated[index] = { ...updated[index], position: [x, y, z] };
          return { ...prev, manualElements: updated };
        });
      }}
    >
      <group>
        {/* کامپوننت اصلی آنتن */}
        <mesh>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshBasicMaterial color="#a855f7" />
        </mesh>
        
        {/* نمایش مختصات که در حالت دستی همیشه دیده می‌شود */}
        <Html position={[0, 0.6, 0]} center>
          <div style={{ 
            background: 'rgba(0,0,0,0.8)', 
            color: '#fff', 
            padding: '4px 8px', 
            fontSize: '12px',
            borderRadius: '4px',
            pointerEvents: 'none',
            border: '1px solid #555'
          }}>
            {`X:${element.position[0].toFixed(2)} Y:${element.position[1].toFixed(2)} Z:${element.position[2].toFixed(2)}`}
          </div>
        </Html>
      </group>
    </TransformControls>
  );
};

export const antennaCategories = [
  { group: "Manual Start", types: ["-"] },
  { group: "Dipole & Monopole", types: ["Dipole (Half-Wave/Folded/Hertz)", "Short Dipole", "Monopole (Whip/Rubber Ducky/Ground Plane/Marconi)", "J-Pole"] },
  { group: "Directional & High Gain", types: ["Yagi-Uda", "Log-Periodic", "Parabolic Dish (Cassegrain/Gregorian)", "Horn (Pyramidal/Conical)"] },
  { group: "Loop & Helical", types: ["Helical (Helix)", "Spiral", "Small Loop (NFC)", "Large Loop"] },
  { group: "Aperture & Patch", types: ["Patch (IFA/PIFA)", "Slot", "Dielectric Resonator"] }
];