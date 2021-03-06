let CanvasKit = null;
import { mat2d, vec2 } from "gl-matrix";
import FillRule from "./FillRule.js";
import StrokeCap from "./StrokeCap.js";
import StrokeJoin from "./StrokeJoin.js";

export default class Graphics
{
	constructor(canvas)
	{
		this._Canvas = canvas;
		this._ViewTransform = mat2d.create();
		this._Cleanup = [];
	}

	initialize(staticPath, cb)
	{
		CanvasKitInit(
		{
			locateFile: (file) => staticPath + file,
		}).then((CK) => 
		{
			// when debugging, it can be handy to not run directly in the then, because if there
			// is a failure (for example, miscalling an API), the WASM loader tries to re-load
			// the web assembly in the (much slower) ArrayBuffer version. This will also fail
			// and thus there is a lot of extra log spew.
			// Thus, the setTimeout to run on the next microtask avoids this second loading
			// and the log spew.
			setTimeout(() => 
			{
				CanvasKit = CK;

				this.updateSurface();
				const clearPaint = new CanvasKit.SkPaint();
				clearPaint.setStyle(CanvasKit.PaintStyle.Fill);
				clearPaint.setBlendMode(CanvasKit.BlendMode.Clear);
				this._ClearPaint = clearPaint;
				cb();
			}, 0);
		});
	}

	updateSurface()
	{
		if(!CanvasKit)
		{
			return;
		}
		if(this._CanvasSurface)
		{
			this._CanvasSurface.delete();
		}
		// if(this._SkCanvas)
		// {
		// 	this._SkCanvas.delete();
		// }
		this._CanvasSurface = CanvasKit.MakeCanvasSurface(this._Canvas.id);
		this._SkCanvas = this._CanvasSurface.getCanvas();
		this._Context = CanvasKit.currentContext();
	}

	save()
	{
		this._SkCanvas.save();
	}

	restore()
	{
		this._SkCanvas.restore();
	}

	get canvas()
	{
		return this._Canvas;
	}

	get ctx()
	{
		return this._Context;
	}

	dispose()
	{

	}

	get width()
	{
		return this._Canvas.width;
	}

	get height()
	{
		return this._Canvas.height;
	}

	clear(color)
	{
		const {_Context:ctx, _ClearPaint:clearPaint, _SkCanvas:skCanvas, width, height} = this;
		CanvasKit.setCurrentContext(ctx);
		if(color)
		{
			clearPaint.setColor(CanvasKit.Color(Math.round(color[0]*255), Math.round(color[1]*255), Math.round(color[2]*255), color[3]));
			clearPaint.setBlendMode(CanvasKit.BlendMode.SrcOver);
		}
		else
		{
			clearPaint.setBlendMode(CanvasKit.BlendMode.Clear);
		}
		skCanvas.drawRect(CanvasKit.LTRBRect(0, 0, width, height), clearPaint);
		skCanvas.save();
	}

	drawPath(path, paint)
	{
		this._SkCanvas.drawPath(path, paint);
	}

	drawRect(x, y, width, height, paint)
	{
		this._SkCanvas.drawRect(CanvasKit.LTRBRect(x, y, width, height), paint);
	}

	setView(matrix)
	{
		this._SkCanvas.concat(
			[matrix[0], matrix[2], matrix[4],
			matrix[1], matrix[3], matrix[5],
			0, 0,  1]);
	}

	addPath(path, addition, matrix)
	{
		// path.addPath(addition, [matrix[0], matrix[1], 0,
		// 	matrix[2], matrix[3], 0,
		// 	matrix[4], matrix[5],  1]);
		path.addPath(addition, [matrix[0], matrix[2], matrix[4],
			matrix[1], matrix[3], matrix[5],
			0, 0,  1]);
	}

	makePath(ephemeral)
	{
		const path = new CanvasKit.SkPath();
		
		if(ephemeral)
		{
			this._Cleanup.push(path);
		}
		return path;
	}

	pathEllipse(path, x, y, radiusX, radiusY, startAngle, endAngle, ccw)
	{
		var bounds = CanvasKit.LTRBRect(x-radiusX, y-radiusY, x+radiusX, y+radiusY);
		var sweep = radiansToDegrees(endAngle - startAngle) - (360 * !!ccw);
		// Skia takes degrees. JS tends to be radians.
		path.addArc(bounds, radiansToDegrees(startAngle), sweep);
	}

	destroyPath(path)
	{
		path.delete();
	}

	makeLinearGradient(start, end, colors, stops)
	{
		colors = colors.map(color => CanvasKit.Color(Math.round(color[0]*255), Math.round(color[1]*255), Math.round(color[2]*255), color[3]));
		//start, end, colors, pos, mode, localMatrix, flags
		return CanvasKit.MakeLinearGradientShader(start, end, colors, stops, CanvasKit.TileMode.Clamp, null, 0);
	}

	makeRadialGradient(center, radius, colors, stops)
	{
		colors = colors.map(color => CanvasKit.Color(Math.round(color[0]*255), Math.round(color[1]*255), Math.round(color[2]*255), color[3]));
		// center, radius, colors, pos, mode, localMatrix, flags
		return CanvasKit.MakeRadialGradientShader(center, radius, colors, stops, CanvasKit.TileMode.Clamp, null, 0);
	}

	destroyRadialGradient(gradient)
	{
		gradient.delete();
	}

	destroyLinearGradient(gradient)
	{
		gradient.delete();
	}

	makePaint(ephemeral)
	{
		const paint = new CanvasKit.SkPaint();
		paint.setAntiAlias(true);
		paint.setBlendMode(CanvasKit.BlendMode.SrcOver);
		if(ephemeral)
		{
			this._Cleanup.push(paint);
		}
		return paint;
	}

	setPaintFill(paint)
	{
		paint.setStyle(CanvasKit.PaintStyle.Fill);
	}

	setPaintColor(paint, color)
	{
		paint.setColor(CanvasKit.Color(Math.round(color[0]*255), Math.round(color[1]*255), Math.round(color[2]*255), color[3]));
	}

	setPathFillType(path, fillRule)
	{
		let fillType;
		switch(fillRule)
		{
			case FillRule.EvenOdd:
				fillType = CanvasKit.FillType.EvenOdd;
				break;
			case FillRule.NonZero:
				fillType = CanvasKit.FillType.Winding;
				break;
		}
		path.setFillType(fillType);
	}

	static setPaintStrokeCap(paint, cap)
	{
		let strokeCap;
		switch(cap)
		{
			case StrokeCap.Butt:
				strokeCap = CanvasKit.StrokeCap.Butt;
				break;
			case StrokeCap.Round:
				strokeCap = CanvasKit.StrokeCap.Round;
				break;
			case StrokeCap.Square:
				strokeCap = CanvasKit.StrokeCap.Square;
				break;
			default:
				strokeCap = CanvasKit.StrokeCap.Butt;
				break;
		}
		paint.setStrokeCap(strokeCap);
	}

	static setPaintStrokeJoin(paint, join)
	{
		let strokeJoin;
		switch(join)
		{
			case StrokeJoin.Miter:
				strokeJoin = CanvasKit.StrokeJoin.Miter;
				break;
			case StrokeJoin.Round:
				strokeJoin = CanvasKit.StrokeJoin.Round;
				break;
			case StrokeJoin.Bevel:
				strokeJoin = CanvasKit.StrokeJoin.Bevel;
				break;
			default:
				strokeJoin = CanvasKit.StrokeJoin.Miter;
				break;
		}
		paint.setStrokeJoin(strokeJoin);
	}

	static setPaintStroke(paint)
	{
		paint.setStyle(CanvasKit.PaintStyle.Stroke);
	}

	destroyPaint(paint)
	{
		paint.delete();
	}

	clipPath(path)
	{
		this._SkCanvas.clipPath(path, CanvasKit.ClipOp.Intersect, true);
	}

	flush()
	{
		this._SkCanvas.restore();
		this._CanvasSurface.flush();

		for(const obj of this._Cleanup)
		{
			obj.delete();
		}
		this._Cleanup.length = 0;
	}

	get viewportWidth()
	{
		return this._Canvas.width;
	}

	get viewportHeight()
	{
		return this._Canvas.height;
	}

	setSize(width, height)
	{
		if(this.width !== width || this.height !== height)
		{
			this._Canvas.width = width;
			this._Canvas.height = height;
			this.updateSurface();
			return true;
		}
		return false;
	}
}

function radiansToDegrees(rad) 
{
	return (rad / Math.PI) * 180;
}