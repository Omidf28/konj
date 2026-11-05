# Complete adult human mannequin

The mannequin uses the authored MakeHuman young-adult male shape with average muscle and weight. It is a complete anatomical mesh, including chest, abdomen, back, pelvis, hands and feet. No torso visibility mask, reduced draw range or body-vertex fitting is used.

All graphical sources are CC0-1.0. Official license: https://www.makehumancommunity.org/about/license.html . Full license texts are preserved here. The immutable upstream revision, source URLs, blend weights and SHA-256 of every input are recorded in adult-source.json. The three authored adult male targets are blended equally; the average universal target is also applied. No upstream program code, rigging implementation or skin-weight file is used.

Generated runtime data: src/lib/adult-human-data.ts. It derives from the original 13,380 body vertices and 26,756 triangles. A stitched, smoothed neutral pelvis patch produces 13,563 vertices and 27,122 triangles; the result is closed and consistently wound. Helper/joint faces are excluded; their locations are retained as joint metadata. Height is normalized to 1.76m; coordinates are quantized at 16,000 units per meter. The anatomical front-groin patch is replaced by a closed retail surface with no explicit genital shape. Local arm posing and circumference adjustment use this project's own code.

The exact reference body shown by the viewer is also exported as public/models/human-adult.glb. adult-model.json records its hash, dimensions and counts. The GLB is self-contained and has one complete connected mesh. It is not a scan of a customer or a guarantee of physical fit.

Rebuild from the verified inputs under ignored storage/art-sources/makehuman/:

    node --experimental-strip-types scripts/build-adult-human.mts
    node --experimental-strip-types scripts/export-adult-human.mts

The generator refuses inputs whose hashes differ from the manifest. Download the inputs from the manifest URLs when rebuilding on a fresh checkout. Production and ordinary local viewing require no external download.
